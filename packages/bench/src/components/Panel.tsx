import type { ReactNode } from 'react';
import './Panel.css';

export interface PanelProps {
  title?: string;
  children?: ReactNode;
  className?: string;
}

/** A hairline-bordered container at rest — no shadow. Shadows are earned by lift (held /
 * overlay states), never worn at rest (design-book/03). */
export function Panel({ title, children, className }: PanelProps) {
  const classes = ['jig-panel', className].filter(Boolean).join(' ');
  return (
    <section className={classes}>
      {title && <h2 className="jig-panel__title">{title}</h2>}
      <div className="jig-panel__body">{children}</div>
    </section>
  );
}
