import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';

const markdownToPlainText = async (markdown: string): Promise<string> => {
  const tree = unified().use(remarkParse).parse(markdown);

  let text = '';
  visit(tree, 'text', (node: any) => {
    text += node.value + ' ';
  });

  return text.trim();
};