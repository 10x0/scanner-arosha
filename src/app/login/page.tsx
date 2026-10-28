import { redirect } from 'next/navigation';
import { getProfile } from '@/lib/auth';
import { LoginForm } from './login-form';

export default async function LoginPage() {
  if (await getProfile()) redirect('/');
  return (
    <div className="auth">
      <div className="c">
        <div className="logo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Logo" width={44} height={44} />
        </div>
        <h2>Scanner Management System · Sign in</h2>
        <LoginForm />
      </div>
    </div>
  );
}
