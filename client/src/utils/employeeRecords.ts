export const filterActiveEmployees = (employees: any[], deletionRecords: any[] = []) => {
  const deletedEmployeeIds = new Set(
    deletionRecords.map((record: any) => String(record.employeeId || record.id))
  );

  return employees.filter((employee: any) =>
    employee &&
    !employee.isDeleted &&
    employee.status !== 'inactive' &&
    !deletedEmployeeIds.has(String(employee.id))
  );
};
