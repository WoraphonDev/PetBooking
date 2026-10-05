import { CustomerFormScreen } from "@/components/c-10/customer-form-screen";

export default async function EditCustomerPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  return <CustomerFormScreen customerId={customerId} />;
}
