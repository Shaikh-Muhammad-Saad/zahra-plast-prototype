export const money = (value: number, digits = 0) => new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
export const number = (value: number) => new Intl.NumberFormat('en-PK').format(value);
export const shortDate = (value: string) => new Date(value.length === 10 ? value + 'T12:00:00' : value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi' });
export const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
export const uid = (prefix = 'id') => `${prefix}-${crypto.randomUUID()}`;
export const initials = (name: string) => name.split(' ').filter(Boolean).slice(0, 2).map(x => x[0]).join('').toUpperCase();
export function downloadText(filename: string, content: string, type = 'text/plain') {
  const link = document.createElement('a'); const url = URL.createObjectURL(new Blob([content], { type }));
  link.href = url; link.download = filename; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
