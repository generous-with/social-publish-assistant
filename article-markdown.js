function prepareToutiaoArticle(markdown, markdownit, withImages = false, preserveArticleText = false) {
  const md = markdownit({ html: false });
  const env = {};
  const tokens = md.parse(markdown, env);
  const heading = tokens.findIndex(token => token.type === 'heading_open' && token.tag === 'h1' && token.level === 0);
  if (heading < 0) throw Error('请用一级标题（# 标题）指定文章标题');
  const title = tokens[heading + 1].content.trim();
  if (!title) throw Error('文章标题为空');
  tokens.splice(heading, 3);
  const tail = tokens.findIndex((token, i) => token.type === 'heading_open' &&
    token.level === 0 && /^写在最后\s*[：:。]?$/.test(tokens[i + 1].content.trim()));
  if (!preserveArticleText && tail >= 0) tokens.splice(tail);
  const imageSlots = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'paragraph_open' || tokens[i].level !== 0) continue;
    const inline = tokens[i + 1];
    const plain = inline.content.replace(/^<p\b[^>]*>|<\/p>$/gi, '').replace(/\*\*/g, '').trim();
    if (!preserveArticleText && /^作者\s*[：:]\s*大书大\s*[|｜]\s*原创技术干货$/.test(plain)) {
      tokens.splice(i, 3);
      i--;
    } else if (inline.children?.length === 1 && inline.children[0].type === 'image') {
      tokens.splice(i, 3);
      imageSlots.push(i);
      i--;
    }
  }
  // Images are sourced only from the user's local selection.
  md.renderer.rules.image = (items, index) => md.utils.escapeHtml(items[index].content);
  let slots = [];
  if (withImages) {
    const boundaries = tokens.flatMap((token, i) => token.level === 0 && token.nesting >= 0 && i ? [i] : []);
    slots = imageSlots.length === 3 ? imageSlots :
      [1, 2, 3].map(part => boundaries[Math.floor(part * boundaries.length / 4)] ?? tokens.length);
    if (tokens[0]?.type === 'blockquote_open') {
      let afterQuote = 0;
      while (tokens[afterQuote]?.type === 'blockquote_open') {
        const end = tokens.findIndex((token, index) =>
          index > afterQuote && token.type === 'blockquote_close' && token.level === 0);
        if (end < 0) break;
        afterQuote = end + 1;
      }
      const remaining = boundaries.filter(index => index > afterQuote);
      const laterSlots = imageSlots.length === 3 && imageSlots[1] >= afterQuote
        ? imageSlots.slice(1)
        : [1, 2].map(part => remaining[Math.floor(part * remaining.length / 3)] ?? tokens.length);
      slots = [afterQuote, ...laterSlots];
    }
  }
  const starts = [0, ...slots], ends = [...slots, tokens.length];
  const sections = starts.map((start, i) => md.renderer.render(tokens.slice(start, ends[i]), md.options, env));
  if (!sections.join('').trim()) throw Error('文章正文为空');
  return { title, sections };
}

if (typeof module !== 'undefined') module.exports = prepareToutiaoArticle;
