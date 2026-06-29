// AppIcon 组件（07 阶段）：包装 src/assets/drop.svg，提供 size / className
import { useEffect, useState } from 'react';

interface Props {
  size?: number;
  className?: string;
  ariaLabel?: string;
}

/** 用 Vite ?raw import 读 SVG 内容（保证 build 时 inline） */
import dropSvg from '@/assets/drop.svg?raw';

export const AppIcon = ({ size = 24, className, ariaLabel = 'Hydropace' }: Props) => {
  const [svg, setSvg] = useState<string>('');

  useEffect(() => {
    // Vite 编译时已经 inline SVG 内容（?raw 导入）
    setSvg(dropSvg);
  }, []);

  if (!svg) return null;

  // 把 svg 里的 width/height 替换成 size，保留 viewBox 让它自适应
  const replaced = svg
    .replace(/width="\d+"/, `width="${size}"`)
    .replace(/height="\d+"/, `height="${size}"`)
    .replace(/<svg([^>]*)>/, `<svg$1 role="img" aria-label="${ariaLabel}" class="${className ?? ''}">`);

  return <span dangerouslySetInnerHTML={{ __html: replaced }} />;
};
