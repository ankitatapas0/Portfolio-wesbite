type TagComponentProps = {
  label: string;
  primary?: boolean;
};

export function TagComponent({ label, primary = false }: TagComponentProps) {
  return (
    <span className={`project-tag${primary ? " project-tag-primary" : ""}`}>
      {label}
    </span>
  );
}
