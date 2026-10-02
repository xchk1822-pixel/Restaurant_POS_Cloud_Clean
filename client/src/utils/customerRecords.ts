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

export const normalizeCustomerPhone = (phone: unknown): string => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 8) return `505${digits}`;
  return digits;
};

export const isValidCustomerPhone = (phone: unknown): boolean => {
  const normalized = normalizeCustomerPhone(phone);
  return normalized.length >= 11 && normalized.length <= 15;
};

export const buildCustomerIdFromPhone = (phone: unknown): string => (
  `CUST-PHONE-${normalizeCustomerPhone(phone)}`
);
