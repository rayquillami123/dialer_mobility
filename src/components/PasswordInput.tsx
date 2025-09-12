'use client';

import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

type Props = React.ComponentProps<typeof Input> & { toggle?: boolean };

export default function PasswordInput({ toggle = true, ...rest }: Props) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input type={show ? 'text' : 'password'} {...rest} />
      {toggle && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute right-1 top-1/2 -translate-y-1/2"
          onClick={() => setShow((s) => !s)}
        >
          {show ? 'Ocultar' : 'Mostrar'}
        </Button>
      )}
    </div>
  );
}
