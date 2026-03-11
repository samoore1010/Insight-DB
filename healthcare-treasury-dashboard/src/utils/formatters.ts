
export const formatCurrency = (val: number, currency: string = 'USD', compact: boolean = true) => {
  return new Intl.NumberFormat('en-US', { 
    style: 'currency', 
    currency: currency, 
    notation: compact ? 'compact' : 'standard' 
  }).format(val);
};

export const formatDate = (date: string | Date, formatStr: string = 'MM/DD/YYYY') => {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return date.toString();

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  switch (formatStr) {
    case 'DD/MM/YYYY':
      return `${day}/${month}/${year}`;
    case 'YYYY-MM-DD':
      return `${year}-${month}-${day}`;
    case 'MM/DD/YYYY':
    default:
      return `${month}/${day}/${year}`;
  }
};
