import sanitizeHtml from 'sanitize-html';

const htmlOptions: sanitizeHtml.IOptions = {
    allowedTags: [
        'a', 'address', 'article', 'b', 'blockquote', 'br', 'caption', 'code', 'dd', 'del', 'div', 'dl', 'dt',
        'em', 'figcaption', 'figure', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'iframe', 'img', 'ins',
        'li', 'ol', 'p', 'pre', 's', 'source', 'span', 'strike', 'strong', 'sub', 'sup', 'table', 'tbody',
        'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul', 'video'
    ],
    allowedAttributes: {
        a: ['href', 'name', 'target', 'rel'],
        img: ['src', 'alt', 'title', 'width', 'height'],
        iframe: ['src', 'title', 'width', 'height', 'allow', 'allowfullscreen', 'frameborder', 'sandbox', 'loading'],
        video: ['src', 'poster', 'controls', 'width', 'height'],
        source: ['src', 'type'],
        '*': ['style']
    },
    allowedStyles: {
        '*': {
            'color': [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i],
            'background-color': [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d\s.,%]+\)$/i],
            'text-align': [/^(left|right|center|justify)$/],
            'font-size': [/^\d+(px|pt|em|rem|%)$/],
            'font-weight': [/^(normal|bold|[1-9]00)$/],
            'font-style': [/^(normal|italic|oblique)$/],
            'text-decoration': [/^(none|underline|line-through)$/],
            'width': [/^\d+(px|%)$/],
            'height': [/^\d+(px|%)$/]
        }
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesByTag: { img: ['http', 'https'], iframe: ['https'], video: ['http', 'https'], source: ['http', 'https'] },
    allowProtocolRelative: false,
    allowedIframeHostnames: ['www.youtube.com', 'www.youtube-nocookie.com', 'player.vimeo.com'],
    transformTags: {
        a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }, true),
        iframe: sanitizeHtml.simpleTransform('iframe', { sandbox: 'allow-scripts allow-same-origin allow-presentation', loading: 'lazy' }, true)
    }
};

export function sanitizeRichHtml(value: unknown): string {
    if (typeof value !== 'string' || value.length > 500_000) return '';
    return sanitizeHtml(value, htmlOptions);
}
