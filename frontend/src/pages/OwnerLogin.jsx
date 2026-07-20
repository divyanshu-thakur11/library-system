import LoginForm from './LoginForm';

export default function OwnerLogin() {
  return (
    <LoginForm
      portal="owner"
      title="Shiv Shakti Library"
      subtitle="Owner sign in"
      altLinkTo="/login/manager"
      altLinkLabel="Manager? Sign in here →"
    />
  );
}
