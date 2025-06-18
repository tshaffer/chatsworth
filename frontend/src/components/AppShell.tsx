export interface AppShellProps {
  pizza?: string;
}

const AppShell = (props: AppShellProps) => {
  const { pizza } = props;

  return (
    <div>
      <h1>App Shell</h1>
      {pizza && <p>Pizza: {pizza}</p>}
      {/* Other components and logic can be added here */}
    </div>
  );
}

export default AppShell;

