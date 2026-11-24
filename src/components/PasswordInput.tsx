import { useState } from 'react'
import type { InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>

/** A password input with a button to show or hide what was typed. */
export function PasswordInput(props: Props) {
  const [shown, setShown] = useState(false)

  return (
    <span className="pw">
      <input {...props} type={shown ? 'text' : 'password'} />
      <button
        type="button"
        className="pw-toggle"
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
        title={shown ? 'Hide password' : 'Show password'}
        onClick={() => setShown((value) => !value)}
      >
        {shown ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </span>
  )
}
