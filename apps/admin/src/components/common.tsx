'use client';

import { CircleAlert, Download } from 'lucide-react';
import { useState } from 'react';
import { downloadFile } from '@/lib/api';
import { Button, Field, Modal, Note, Textarea } from './ui';
import { useToast } from './toast';

type Query = Record<string, string | number | boolean | undefined | null>;

export function DownloadButton({
  path,
  query,
  filename,
  children = 'Excel',
  variant = 'secondary',
  disabled,
}: {
  path: string;
  query?: Query;
  filename: string;
  children?: React.ReactNode;
  variant?: 'secondary' | 'primary' | 'dark';
  disabled?: boolean;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant={variant}
      loading={busy}
      disabled={disabled}
      onClick={async () => {
        setBusy(true);
        try {
          await downloadFile(path, query, filename);
        } catch (e) {
          toast.error(e);
        } finally {
          setBusy(false);
        }
      }}
    >
      {!busy && <Download className="h-4 w-4" />}
      {children}
    </Button>
  );
}

/** Модалка «укажите причину» для отклонения/блокировки/отмены. */
export function ReasonModal({
  open,
  title,
  description,
  confirmLabel,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description?: React.ReactNode;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const valid = reason.trim().length >= 2;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button
            variant="dark"
            disabled={!valid}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(reason.trim());
                setReason('');
                onClose();
              } catch (e) {
                toast.error(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {description && (
        <Note tone="yellow" icon={<CircleAlert className="h-4 w-4" />} className="mb-4">
          {description}
        </Note>
      )}
      <Field label="Причина (обязательно)" hint="Её увидит партнёр в приложении">
        <Textarea
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Например: нет в наличии, неверные реквизиты…"
        />
      </Field>
    </Modal>
  );
}
