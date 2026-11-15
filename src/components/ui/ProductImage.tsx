import { Package } from 'lucide-react';
import { useState } from 'react';
export function ProductImage({ src, name, large = false }: { src?: string; name: string; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  return <div className={`product-image ${large ? 'product-image-large' : ''}`}>{src && !failed ? <img src={src} alt={name} loading="lazy" onError={() => setFailed(true)} width={large ? 200 : 48} height={large ? 200 : 48} /> : <Package size={large ? 48 : 22} aria-label="Product image unavailable" />}</div>;
}
