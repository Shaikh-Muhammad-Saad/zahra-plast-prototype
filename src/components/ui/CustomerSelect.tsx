import { useMemo } from 'react';
import type { Customer } from '../../types';
import { SearchableSelect } from './SearchableSelect';

type Props = {
  customers: Customer[];
  value: string;
  onChange: (customerId: string) => void;
  label?: string;
  accessibleLabel?: string;
  disabled?: boolean;
  hint?: string;
  hideLabel?: boolean;
  className?: string;
  allCustomers?: boolean;
  placeholder?: string;
};

export function CustomerSelect({ customers, value, onChange, label = 'Customer', accessibleLabel,
  disabled, hint, hideLabel, className, allCustomers = false, placeholder = 'Select a customer' }: Props) {
  const options = useMemo(() => [
    ...(allCustomers ? [{ value: '', label: 'All customers' }] : []),
    ...customers.map(customer => ({ value: customer.id, label: customer.name, description: customer.code })),
  ], [customers, allCustomers]);

  return <SearchableSelect label={label} accessibleLabel={accessibleLabel} value={value} options={options}
    onChange={onChange} placeholder={placeholder} disabled={disabled} hint={hint} hideLabel={hideLabel}
    className={className} searchLabel="Search customers" searchPlaceholder="Search customer name or code..."
    resultsLabel="Customers" emptyMessage="No customers found" emptyHint="Try another customer name or code." />;
}
