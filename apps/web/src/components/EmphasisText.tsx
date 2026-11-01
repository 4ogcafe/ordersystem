import { Fragment } from 'react';

interface EmphasisTextProps {
  text: string;
}

/**
 * Renders admin-editable headings such as "私たちの<em>店舗</em>".
 * Only <em> is honoured; everything else is shown as plain text, so settings can never inject HTML.
 */
export default function EmphasisText({ text }: EmphasisTextProps) {
  return (
    <>
      {text.split(/(<em>.*?<\/em>)/g).map((part, i) => {
        const emphasised = part.match(/^<em>(.*)<\/em>$/);
        return emphasised ? <em key={i}>{emphasised[1]}</em> : <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}
