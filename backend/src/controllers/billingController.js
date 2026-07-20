const db = require('../db');
const { logAudit } = require('../middleware/audit');
const { nextBillNumber, nextReceiptNumber } = require('../utils/idGenerator');
const { AppError } = require('../middleware/errorHandler');

async function listBills(req, res, next) {
  try {
    const { member_id, status, from, to } = req.query;
    let query = db('bills as b')
      .join('members as m', 'm.id', 'b.member_id')
      .leftJoin(
        db('receipts').select('bill_id').sum('amount_paid as paid_total').groupBy('bill_id').as('r'),
        'r.bill_id',
        'b.id'
      )
      .select(
        'b.*',
        'm.member_code',
        'm.name as member_name',
        db.raw('COALESCE(r.paid_total, 0) as paid_total'),
        db.raw('b.final_amount - COALESCE(r.paid_total, 0) as due_amount')
      )
      .orderBy('b.created_at', 'desc');

    if (member_id) query = query.where('b.member_id', member_id);
    if (from) query = query.where('b.created_at', '>=', from);
    if (to) query = query.where('b.created_at', '<=', to);

    let bills = await query;
    bills = bills.map((b) => ({
      ...b,
      due_amount: Math.max(0, Number(b.due_amount)),
      status: b.voided_at ? 'voided' : Number(b.due_amount) <= 0 ? 'paid' : Number(b.paid_total) > 0 ? 'partial' : 'pending',
    }));

    if (status) bills = bills.filter((b) => b.status === status);

    res.json({ bills });
  } catch (err) {
    next(err);
  }
}

async function createBill(req, res, next) {
  try {
    const { member_id, cabin_id, fee_structure_id, package_type: bodyPackageType, total_hours: bodyHours, base_amount: bodyAmount, discount = 0, payment_mode = 'cash', bill_date, pending_validity_start, pending_validity_end } = req.body;
    if (!member_id) throw new AppError(400, 'member_id is required');
    if (!['cash', 'online'].includes(payment_mode)) throw new AppError(400, "payment_mode must be 'cash' or 'online'");

    let package_type = bodyPackageType;
    let total_hours = bodyHours;
    let base_amount = bodyAmount;

    if (fee_structure_id) {
      const fs = await db('fee_structures').where({ id: fee_structure_id }).first();
      if (!fs) throw new AppError(404, 'Fee structure not found');
      package_type = fs.package_type;
      total_hours = fs.hours_per_day;
      base_amount = fs.amount;
    }

    if (!package_type || base_amount === undefined) {
      throw new AppError(400, 'Provide fee_structure_id, or package_type and base_amount directly');
    }

    if (discount < 0) throw new AppError(400, 'Discount cannot be negative.');
    const final_amount = Number(base_amount) - Number(discount);
    if (final_amount < 0) throw new AppError(400, 'Discount cannot exceed base amount');

    const bill = await db.transaction(async (trx) => {
      const bill_number = await nextBillNumber(trx);
      const [row] = await trx('bills')
        .insert({
          bill_number,
          member_id,
          cabin_id,
          fee_structure_id: fee_structure_id || null,
          package_type,
          total_hours,
          base_amount,
          discount,
          final_amount,
          payment_mode,
          // The validity period this bill is *meant* to grant, applied to
          // the member only once this bill is fully paid (see
          // receiptController.createReceipt) - not immediately at
          // creation, so a part payment can't prematurely extend someone's
          // membership.
          pending_validity_start: pending_validity_start || null,
          pending_validity_end: pending_validity_end || null,
          created_by: req.user.id,
          created_at: bill_date ? new Date(bill_date) : trx.fn.now(),
        })
        .returning('*');

      await logAudit(
        {
          user: req.user,
          actionType: 'BILL_CREATED',
          entityType: 'bill',
          entityId: row.id,
          after: row,
        },
        trx
      );

      return row;
    });

    res.status(201).json({ bill });
  } catch (err) {
    next(err);
  }
}

// Voids a mis-entered bill (Owner only). Only allowed before any payment
// has been recorded against it - once money has actually changed hands,
// the correct fix is a receipt/refund trail, not silently erasing the
// bill's existence. This preserves it for audit purposes with a reason
// attached, rather than deleting it.
async function voidBill(req, res, next) {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    if (!reason) throw new AppError(400, 'A reason is required to void a bill.');

    const bill = await db('bills').where({ id }).first();
    if (!bill) throw new AppError(404, 'Bill not found');
    if (bill.voided_at) throw new AppError(400, 'This bill is already voided.');

    const paid = await db('receipts').where({ bill_id: id }).sum('amount_paid as total').first();
    if (Number(paid.total) > 0) {
      throw new AppError(409, 'Cannot void a bill that already has payments recorded against it.');
    }

    const [after] = await db('bills')
      .where({ id })
      .update({ voided_at: db.fn.now(), void_reason: reason, voided_by: req.user.id })
      .returning('*');

    await logAudit({
      user: req.user,
      actionType: 'BILL_VOIDED',
      entityType: 'bill',
      entityId: id,
      before: { voided_at: null },
      after: { voided_at: after.voided_at, void_reason: reason },
    });

    res.json({ bill: after });
  } catch (err) {
    next(err);
  }
}

// Both roles can edit a bill's details (unlike void/approve, which stay
// Owner-only) - useful for fixing a typo'd amount or package right after
// entry without needing the Owner to step in for every small correction.
async function updateBill(req, res, next) {
  try {
    const { id } = req.params;

    const after = await db.transaction(async (trx) => {
      const before = await trx('bills').where({ id }).first();
      if (!before) throw new AppError(404, 'Bill not found');
      if (before.voided_at) throw new AppError(400, 'This bill has been voided and cannot be edited.');

      const allowed = ['bill_number', 'package_type', 'total_hours', 'base_amount', 'discount', 'payment_mode'];
      const updates = {};
      for (const f of allowed) {
        if (req.body[f] !== undefined) updates[f] = req.body[f];
      }

      if (updates.payment_mode && !['cash', 'online'].includes(updates.payment_mode)) {
        throw new AppError(400, "payment_mode must be 'cash' or 'online'");
      }
      if (updates.bill_number !== undefined && !updates.bill_number.trim()) {
        throw new AppError(400, 'Bill number cannot be blank.');
      }

      const newBase = updates.base_amount !== undefined ? Number(updates.base_amount) : Number(before.base_amount);
      const newDiscount = updates.discount !== undefined ? Number(updates.discount) : Number(before.discount);
      if (newDiscount < 0) throw new AppError(400, 'Discount cannot be negative.');
      const newFinal = newBase - newDiscount;
      if (newFinal < 0) throw new AppError(400, 'Discount cannot exceed base amount.');
      const finalAmountChanged = updates.base_amount !== undefined || updates.discount !== undefined;
      if (finalAmountChanged) {
        updates.final_amount = newFinal;
      }

      if (updates.bill_number) {
        const clash = await trx('bills').whereNot({ id }).andWhere({ bill_number: updates.bill_number }).first();
        if (clash) throw new AppError(409, 'That bill number is already used by another bill.');
      }

      const [updatedBill] = await trx('bills').where({ id }).update(updates).returning('*');

      // The bill's own final_amount is what everything else (Billing
      // table, Dues tab) reads live, so those already show correct
      // figures automatically. But each individual RECEIPT stores its own
      // "due after this payment" snapshot from when it was created - if
      // the bill's total changes after payments exist, those snapshots go
      // stale unless recalculated here too.
      if (finalAmountChanged) {
        const receipts = await trx('receipts').where({ bill_id: id }).orderBy('created_at', 'asc');
        if (receipts.length > 0) {
          let runningPaid = 0;
          for (const r of receipts) {
            runningPaid += Number(r.amount_paid);
            const newDue = Math.max(0, newFinal - runningPaid);
            await trx('receipts').where({ id: r.id }).update({ due_amount: newDue, updated_at: trx.fn.now() });
          }
        }
      }

      await logAudit(
        {
          user: req.user,
          actionType: 'BILL_UPDATED',
          entityType: 'bill',
          entityId: id,
          before,
          after: updatedBill,
        },
        trx
      );

      return updatedBill;
    });

    res.json({ bill: after });
  } catch (err) {
    next(err);
  }
}

// Approves and fully records payment for every currently outstanding bill
// at once (Owner only) - a bulk version of the one-at-a-time "Approve &
// Record Payment" flow, for clearing a backlog in one click.
async function approveAllBills(req, res, next) {
  try {
    const outstanding = await db('bills as b')
      .leftJoin(
        db('receipts').select('bill_id').sum('amount_paid as paid_total').groupBy('bill_id').as('r'),
        'r.bill_id',
        'b.id'
      )
      .whereNull('b.voided_at')
      .whereRaw('b.final_amount - COALESCE(r.paid_total, 0) > 0.01')
      .select('b.id', 'b.bill_number', 'b.final_amount', 'b.payment_mode', db.raw('COALESCE(r.paid_total, 0) as paid_total'));

    const results = await db.transaction(async (trx) => {
      const approved = [];
      for (const bill of outstanding) {
        const dueAmount = Number(bill.final_amount) - Number(bill.paid_total);
        const receipt_number = await nextReceiptNumber(trx);
        const [receipt] = await trx('receipts')
          .insert({
            receipt_number,
            bill_id: bill.id,
            amount_paid: dueAmount,
            due_amount: 0,
            payment_mode: bill.payment_mode || 'cash',
            created_by: req.user.id,
          })
          .returning('*');
        approved.push({ bill_id: bill.id, bill_number: bill.bill_number, amount_paid: dueAmount, receipt_id: receipt.id });
      }
      return approved;
    });

    await logAudit({
      user: req.user,
      actionType: 'BILLS_BULK_APPROVED',
      entityType: 'bill',
      entityId: 'bulk',
      after: { count: results.length },
    });

    res.json({ ok: true, approved: results });
  } catch (err) {
    next(err);
  }
}

module.exports = { listBills, createBill, voidBill, updateBill, approveAllBills };