export const filterActiveCustomers = (customers: any[], deletionRecords: any[] = []) => {
  const deletedCustomerIds = new Set(
    deletionRecords.map((record: any) => String(record.customerId || record.id))
  );

  return customers.filter((customer: any) =>
    customer &&
    !customer.isDeleted &&
    customer.status !== 'inactive' &&
    !deletedCustomerIds.has(String(customer.id))
  );
};
