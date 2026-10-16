import type { ReactNode } from 'react';
import { Icon } from '../icons';

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className ? `card ${className}` : 'card'}>{children}</div>;
}

export function CardHead({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="card-head">
      <div className="card-head-text">
        <h2 className="card-title">{title}</h2>
        {subtitle && <p className="card-sub">{subtitle}</p>}
      </div>
      {actions && <div className="card-actions">{actions}</div>}
    </div>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="section-label">{children}</div>;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={option.value === value ? 'active' : ''}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="error-banner" role="alert">
      <Icon name="warning" size={16} />
      <span>{message}</span>
    </div>
  );
}

export function Spinner({ size = 22 }: { size?: number }) {
  return <div className="spinner" style={{ width: size, height: size }} />;
}

export function RowCard({ children }: { children: ReactNode }) {
  return <div className="rowcard">{children}</div>;
}

export function SettingRow({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: string;
  children: ReactNode;
}) {
  return (
    <div className="setting-row">
      <div className="setting-row-label">
        <div className="setting-row-title">{title}</div>
        {sub && <div className="setting-row-sub">{sub}</div>}
      </div>
      {children}
    </div>
  );
}
