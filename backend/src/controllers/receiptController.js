const db = require('../db');
const { logAudit } = require('../middleware/audit');
const { nextReceiptNumber } = require('../utils/idGenerator');
const { AppError } = require('../middleware/errorHandler');

async function listReceipts(req, res, next) {
  try {
    const { bill_id, member_id } = req.query;
    let query = db('receipts as r')
      .join('bills as b', 'b.id', 'r.bill_id')
      .join('members as m', 'm.id', 'b.member_id')
      .leftJoin('users as u', 'u.id', 'r.created_by')
      .select(
        'r.*',
        'b.bill_number',
        'b.pending_validity_start',
        'b.pending_validity_end',
        'm.member_code',
        'm.name as member_name',
        'm.contact as member_contact',
        'u.name as approved_by'
      )
      .orderBy('r.created_at', 'desc');
    if (bill_id) query = query.where('r.bill_id', bill_id);
    if (member_id) query = query.where('b.member_id', member_id);
    const receipts = await query;
    res.json({ receipts });
  } catch (err) {
    next(err);
  }
}

async function createReceipt(req, res, next) {
  try {
    const { bill_id, amount_paid, payment_mode, paid_at } = req.body;
    if (!bill_id || amount_paid === undefined || !payment_mode) {
      throw new AppError(400, 'bill_id, amount_paid and payment_mode are required');
    }
    if (!['cash', 'online'].includes(payment_mode)) {
      throw new AppError(400, 'payment_mode must be cash or online');
    }
    if (Number(amount_paid) <= 0) {
      throw new AppError(400, 'Amount paid must be greater than zero.');
    }

    const receipt = await db.transaction(async (trx) => {
      const bill = await trx('bills').where({ id: bill_id }).first();
      if (!bill) throw new AppError(404, 'Bill not found');
      if (bill.voided_at) throw new AppError(400, 'This bill has been voided and cannot accept payments.');

      const previouslyPaid = await trx('receipts')
        .where({ bill_id })
        .sum('amount_paid as total')
        .first();
      const alreadyPaid = Number(previouslyPaid.total) || 0;
      const remaining = Number(bill.final_amount) - alreadyPaid;

      if (Number(amount_paid) > remaining + 0.01) {
        throw new AppError(
          400,
          `Amount paid (₹${amount_paid}) exceeds the remaining due (₹${remaining.toFixed(2)}) on this bill.`
        );
      }

      const due_amount = Math.max(0, remaining - Number(amount_paid));

      const receipt_number = await nextReceiptNumber(trx);
      const [row] = await trx('receipts')
        .insert({
          receipt_number,
          bill_id,
          amount_paid,
          due_amount,
          payment_mode,
          paid_at: paid_at || trx.fn.now(),
          created_by: req.user.id,
        })
        .returning('*');

      // Once a bill is fully settled, extend the member's validity so
      // they drop off Overdue/Dues automatically (those lists are driven
      // by validity_end, not by payment status directly). Only applies
      // when the bill is tied to a fee structure with a known duration -
      // custom/manual bills don't carry enough info to auto-extend, so
      // those still need a manual validity update from the Members tab.
      // Only applies once the bill is genuinely fully paid - a part
      // payment must never extend validity, since the member hasn't
      // actually paid for the new period yet.
      if (due_amount <= 0) {
        if (bill.pending_validity_start || bill.pending_validity_end) {
          // Explicit period chosen by staff at assignment/renewal time
          // (Cabins tab or Renewal tab) - always takes priority since it's
          // exactly what was agreed, not a guess.
          await trx('members')
            .where({ id: bill.member_id })
            .update({
              validity_start: bill.pending_validity_start,
              validity_end: bill.pending_validity_end,
              updated_at: trx.fn.now(),
            });
        } else if (bill.fee_structure_id) {
          // Fallback for a plain New Bill made against a Fee Structure with
          // no explicit period attached - estimate from its duration.
          const feeStructure = await trx('fee_structures').where({ id: bill.fee_structure_id }).first();
          if (feeStructure) {
            const member = await trx('members').where({ id: bill.member_id }).first();
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const currentEnd = member.validity_end ? new Date(member.validity_end) : null;
            const base = currentEnd && currentEnd > today ? currentEnd : today;
            const newEnd = new Date(base);
            newEnd.setMonth(newEnd.getMonth() + feeStructure.duration_months);

            await trx('members')
              .where({ id: bill.member_id })
              .update({
                validity_start: member.validity_start || today.toISOString().slice(0, 10),
                validity_end: newEnd.toISOString().slice(0, 10),
                updated_at: trx.fn.now(),
              });
          }
        }
      }

      await logAudit(
        {
          user: req.user,
          actionType: 'RECEIPT_CREATED',
          entityType: 'receipt',
          entityId: row.id,
          after: row,
        },
        trx
      );

      return row;
    });

    res.status(201).json({ receipt });
  } catch (err) {
    next(err);
  }
}

// Editing a receipt is trickier than it looks: `due_amount` on every
// receipt is a snapshot of "what was still owed right after this
// payment". If a bill has multiple part payments and an earlier one gets
// edited, every receipt after it on that bill has a due_amount that's now
// wrong. So this walks all of that bill's receipts in chronological order
// and recomputes the running total from scratch, rather than only
// touching the one row being edited.
async function updateReceipt(req, res, next) {
  try {
    const { id } = req.params;
    const { amount_paid, payment_mode, paid_at, receipt_number, bill_number } = req.body;

    const updated = await db.transaction(async (trx) => {
      const before = await trx('receipts').where({ id }).first();
      if (!before) throw new AppError(404, 'Receipt not found');

      const bill = await trx('bills').where({ id: before.bill_id }).first();
      if (bill.voided_at) throw new AppError(400, 'This bill has been voided.');

      if (payment_mode && !['cash', 'online'].includes(payment_mode)) {
        throw new AppError(400, 'payment_mode must be cash or online');
      }
      if (amount_paid !== undefined && Number(amount_paid) <= 0) {
        throw new AppError(400, 'Amount paid must be greater than zero.');
      }
      if (receipt_number !== undefined && !receipt_number.trim()) {
        throw new AppError(400, 'Receipt number cannot be blank.');
      }
      if (bill_number !== undefined && !bill_number.trim()) {
        throw new AppError(400, 'Bill number cannot be blank.');
      }

      if (receipt_number) {
        const clash = await trx('receipts').whereNot({ id }).andWhere({ receipt_number }).first();
        if (clash) throw new AppError(409, 'That receipt number is already used by another receipt.');
      }
      if (bill_number && bill_number !== bill.bill_number) {
        const clash = await trx('bills').whereNot({ id: bill.id }).andWhere({ bill_number }).first();
        if (clash) throw new AppError(409, 'That bill number is already used by another bill.');
        await trx('bills').where({ id: bill.id }).update({ bill_number, updated_at: trx.fn.now() });
      }

      const allReceipts = await trx('receipts')
        .where({ bill_id: before.bill_id })
        .orderBy('created_at', 'asc');

      let runningPaid = 0;
      let editedRow = null;
      for (const r of allReceipts) {
        const thisAmount = r.id === id && amount_paid !== undefined ? Number(amount_paid) : Number(r.amount_paid);
        runningPaid += thisAmount;
        const newDue = Math.max(0, Number(bill.final_amount) - runningPaid);

        if (runningPaid > Number(bill.final_amount) + 0.01) {
          throw new AppError(
            400,
            `This change would make total payments on bill ${bill.bill_number} exceed its final amount (₹${bill.final_amount}). Reduce the amount and try again.`
          );
        }

        const rowUpdates = { due_amount: newDue, updated_at: trx.fn.now() };
        if (r.id === id) {
          if (amount_paid !== undefined) rowUpdates.amount_paid = thisAmount;
          if (payment_mode) rowUpdates.payment_mode = payment_mode;
          if (paid_at) rowUpdates.paid_at = paid_at;
          if (receipt_number) rowUpdates.receipt_number = receipt_number;
        }
        const [row] = await trx('receipts').where({ id: r.id }).update(rowUpdates).returning('*');
        if (r.id === id) editedRow = row;
      }

      await logAudit(
        {
          user: req.user,
          actionType: 'RECEIPT_UPDATED',
          entityType: 'receipt',
          entityId: id,
          before,
          after: editedRow,
        },
        trx
      );

      return editedRow;
    });

    res.json({ receipt: updated });
  } catch (err) {
    next(err);
  }
}

module.exports = { listReceipts, createReceipt, updateReceipt };