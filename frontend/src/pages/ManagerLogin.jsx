import LoginForm from './LoginForm';

export default function ManagerLogin() {
  return (
    <LoginForm
      portal="manager"
      title="Shiv Shakti Library"
      subtitle="Manager sign in"
      altLinkTo="/login/owner"
      altLinkLabel="Owner? Sign in here →"
    />
  );
}
