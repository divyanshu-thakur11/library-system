import EnquiryLikePage from './EnquiryLikePage';

export default function Demo() {
  return (
    <EnquiryLikePage
      title="Demo Register"
      eyebrow="Demo"
      dateField="demo_date"
      dateLabel="Demo Date"
      apiPath="/demos"
      entityKey="demos"
      prospectSource="Demo"
      showExpectedPayment
      pullApiPath="/enquiries"
      pullEntityKey="enquiries"
      pullSourceLabel="Enquiry"
    />
  );
}