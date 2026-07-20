import EnquiryLikePage from './EnquiryLikePage';

export default function Enquiry() {
  return (
    <EnquiryLikePage
      title="Enquiry Register"
      eyebrow="Enquiry"
      dateField="enquiry_date"
      dateLabel="Enquiry Date"
      apiPath="/enquiries"
      entityKey="enquiries"
      prospectSource="Enquiry"
    />
  );
}
