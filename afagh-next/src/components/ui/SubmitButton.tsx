'use client';

import { useFormStatus } from 'react-dom';
import Button, { type ButtonProps } from './Button';

/** دکمهٔ ارسالِ فرم که وضعیت `pending` را از `useFormStatus` می‌گیرد. */
export default function SubmitButton(props: ButtonProps) {
  const { pending } = useFormStatus();
  return <Button type="submit" loading={pending} {...props} />;
}
