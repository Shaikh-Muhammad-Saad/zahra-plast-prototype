import { Package } from 'lucide-react';
import { useState } from 'react';
export function ProductImage({ src, name, large = false }: { src?: string; name: string; large?: boolean }) {
  const [failedSrc, setFailedSrc] = useState<string>();
  return <div className={`product-image ${large ? 'product-image-large' : ''}`}>{src && src !== failedSrc ? <img src={src} alt={name} loading="lazy" onError={() => setFailedSrc(src)} width={large ? 200 : 48} height={large ? 200 : 48} /> : <Package size={large ? 48 : 22} aria-label="Product image unavailable" />}</div>;
}
