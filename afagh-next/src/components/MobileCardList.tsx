'use client';

import React from 'react';

/**
 * لایهٔ موبایل (لایهٔ ب/د): کامپوننتِ کارتِ واقعی.
 *
 * صفحه‌ها جدولِ دسکتاپ خود را نگه می‌دارند (با کلاس `rt` که روی موبایل توسط
 * MobileTableEnhancer به کارت تبدیل می‌شود) و برای نمای موبایلِ «واقعی»
 * (کنترلِ کامل روی سربرگ/فیلدها/دکمه‌ها) این کامپوننت را کنار آن اضافه
 * می‌کنند. خودِ کامپوننت روی دسکتاپ مخفی است (`.mc-list` در CSS) و فقط در
 * عرض‌های ≤۷۶۸px نمایش داده می‌شود، پس دو بار رندر شدن باعث تداخل نمی‌شود.
 */
export type CardColumn<T> = {
  /** کلیدِ فیلد روی سطر (برای مقدار پیش‌فرض) */
  key: string;
  /** برچسبِ نمایشی */
  label: string;
  /** نمایشِ سفارشی به‌جای مقدارِ خامِ row[key] */
  render?: (row: T, index: number) => React.ReactNode;
  /** نمایش به عنوان تیترِ کارت (ضخیم، بالا) */
  title?: boolean;
  /** نمایش به عنوان زیرتیتر زیر تیتر */
  subtitle?: boolean;
  /** عرضِ کلاسِ اضافه روی ردیفِ فیلد */
  className?: string;
  /** مقدار را بدون برچسب نمایش بده (مثلاً برای بجت/وضعیت) */
  bare?: boolean;
};

export type MobileCardListProps<T> = {
  rows: T[];
  columns: CardColumn<T>[];
  getKey: (row: T, index: number) => string | number;
  /** المانِ پیشرو (مثلاً چک‌باکس/آواتار) در سربرگِ کارت */
  renderLead?: (row: T, index: number) => React.ReactNode;
  /** محتوای سفارشیِ سربرگ (جایگزینِ تیتر/زیرتیترِ خودکار) */
  renderHeader?: (row: T, index: number) => React.ReactNode;
  /** دکمه‌های پایینِ کارت */
  renderActions?: (row: T, index: number) => React.ReactNode;
  /** نمایش به صورت ستونی (بلوک) به جای گرید */
  block?: boolean;
  /** متن/المانِ خالی */
  empty?: React.ReactNode;
  className?: string;
};

export default function MobileCardList<T>({
  rows,
  columns,
  getKey,
  renderLead,
  renderHeader,
  renderActions,
  block,
  empty,
  className,
}: MobileCardListProps<T>) {
  const titles = columns.filter((c) => c.title);
  const subtitles = columns.filter((c) => c.subtitle && !c.title);
  const fields = columns.filter((c) => !c.title && !c.subtitle);

  if (!rows.length) {
    return (
      <div className={`mc-list mc-list--empty ${className ?? ''}`}>
        {empty ?? <div className="mc-empty">موردی یافت نشد.</div>}
      </div>
    );
  }

  return (
    <div className={`mc-list ${block ? 'mc-list--block' : ''} ${className ?? ''}`}>
      {rows.map((row, i) => (
        <div key={getKey(row, i)} className="mc-card">
          {renderHeader ? (
            <div className="mc-card__head">
              {renderLead?.(row, i)}
              <div className="mc-card__head-main">{renderHeader(row, i)}</div>
            </div>
          ) : titles.length || subtitles.length || renderLead ? (
            <div className="mc-card__head">
              {renderLead?.(row, i)}
              <div className="mc-card__head-main">
                {titles.map((c) => (
                  <p key={c.key} className="mc-card__title">
                    {c.render ? c.render(row, i) : (row as Record<string, React.ReactNode>)[c.key]}
                  </p>
                ))}
                {subtitles.map((c) => (
                  <p key={c.key} className="mc-card__subtitle">
                    {c.render ? c.render(row, i) : (row as Record<string, React.ReactNode>)[c.key]}
                  </p>
                ))}
              </div>
            </div>
          ) : null}

          {fields.length > 0 && (
            <div className="mc-card__body">
              {fields.map((c) => (
                <div key={c.key} className={`mc-field ${c.className ?? ''}`}>
                  {c.bare ? (
                    <span className="mc-field__value">{c.render ? c.render(row, i) : (row as Record<string, React.ReactNode>)[c.key]}</span>
                  ) : (
                    <>
                      <span className="mc-field__label">{c.label}</span>
                      <span className="mc-field__value">
                        {c.render ? c.render(row, i) : (row as Record<string, React.ReactNode>)[c.key]}
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {renderActions && (
            <div className="mc-card__foot">{renderActions(row, i)}</div>
          )}
        </div>
      ))}
    </div>
  );
}
