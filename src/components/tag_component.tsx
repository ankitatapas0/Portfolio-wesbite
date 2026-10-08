type TagComponentProps = {
  label: string;
  primary?: boolean;
};

export function TagComponent({ label, primary = false }: TagComponentProps) {
  const titleCaseLabel = label.toLowerCase().replace(/\b[a-z]/g, (letter) => letter.toUpperCase());

  return (
    <span className={`project-tag${primary ? " project-tag-primary" : ""}`}>
      {titleCaseLabel}
    </span>
  );
}
