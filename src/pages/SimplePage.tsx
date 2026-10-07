type SimplePageProps = {
  title: "Work" | "About";
};

export function SimplePage({ title }: SimplePageProps) {
  return (
    <main className="simple-page">
      <p className="eyebrow">Portfolio / {title}</p>
      <h1>{title}</h1>
      <p>This page is ready for its next layer.</p>
    </main>
  );
}