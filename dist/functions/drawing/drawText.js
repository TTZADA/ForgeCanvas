"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const __1 = require("../..");

const twemoji = require('@twemoji/api');

function getEmojiUrl(text, options = {}) {
  const baseUrl = options.baseUrl || 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/';
  const ext = options.ext || '.png';

  let firstUrl = null;

  twemoji.parse(text, {
    callback: (icon) => {
      if (!firstUrl) {
        firstUrl = `${baseUrl}${icon}${ext}`;
      }
      return '';
    },
  });

  return firstUrl;
}

exports.default = new forgescript_1.NativeFunction({
    name: '$drawText',
    aliases: ['$placeText', '$text', '$writeText', '$addText'],
    description: 'Draws a filled/stroked text on a canvas.',
    version: '1.0.0',
    brackets: true,
    unwrap: true,
    args: [
        {
            name: 'canvasName',
            description: 'Name of the canvas.',
            type: forgescript_1.ArgType.String,
            required: false,
            rest: false
        },
        {
            name: 'mode',
            description: 'The mode of function.',
            type: forgescript_1.ArgType.Enum,
            enum: __1.FillOrStroke,
            required: true,
            rest: false
        },
        {
            name: 'text',
            description: 'The text.',
            type: forgescript_1.ArgType.String,
            required: true,
            rest: false
        },
        {
            name: 'font',
            description: 'The font of text.',
            type: forgescript_1.ArgType.String,
            check: (i) => __1.CanvasUtil.isValidFont(i),
            required: true,
            rest: false
        },
        {
            name: 'style',
            description: 'The style text.',
            type: forgescript_1.ArgType.String,
            required: true,
            rest: false
        },
        {
            name: 'x',
            description: 'The image start X coordinate.',
            type: forgescript_1.ArgType.Number,
            required: true,
            rest: false
        },
        {
            name: 'y',
            description: 'The image start Y coordinate.',
            type: forgescript_1.ArgType.Number,
            required: true,
            rest: false
        },
        {
            name: 'emojiSize',
            description: 'The emoji size.',
            type: forgescript_1.ArgType.Number,
            required: false,
            rest: false
        },
        {
            name: 'maxWidth',
            description: 'Maximum font width.',
            type: forgescript_1.ArgType.Number,
            required: false,
            rest: false
        },
        {
            name: 'multiline',
            description: 'Indicates if the text should be drawn in multiple lines if it exceeds the maximum width.',
            type: forgescript_1.ArgType.Boolean,
            required: false,
            rest: false
        },
        {
            name: 'wrap',
            description: 'Wraps the text if true.',
            type: forgescript_1.ArgType.Boolean,
            required: false,
            rest: false
        },
        {
            name: 'lineOffset',
            description: 'The text lines offset.',
            type: forgescript_1.ArgType.Number,
            required: false,
            rest: false
        },
    ],
async execute(ctx, [canvasName, mode, text, font, style, x, y, emojiSize, maxWidth, multiline, wrap, lineOffset]) {
    const canvas = canvasName
        ? ctx.canvasManager?.get(canvasName)
        : ctx.canvasManager?.lastCurrent;
    if (!canvas) return this.customError(__1.FCError.NoCanvas);

    // Apply font and style
    if (font) canvas.ctx.font = font;
    const styleProp = mode === __1.FillOrStroke.fill ? 'fillStyle' : 'strokeStyle';
    const prevStyle = canvas.ctx[styleProp];
    const resolved = style
        ? await __1.CanvasUtil.resolveStyle(this, ctx, canvas, style)
        : null;
    if (resolved instanceof forgescript_1.Return) return resolved;
    if (resolved) canvas.ctx[styleProp] = resolved;

    // Determine emoji draw size
    const size = emojiSize || parseInt(canvas.ctx.font) || 16;
    const actualLineOffset = lineOffset || size * 1.2;

    // Caches
    const urlCache = new Map();
    const emojiUrlCache = new Map();
    
    // Helper function to check if URL exists (with cache)
    const checkUrl = async (url) => {
        if (urlCache.has(url)) {
            return urlCache.get(url);
        }
        
        try {
            const response = await fetch(url, { method: 'HEAD' });
            const exists = response.ok;
            urlCache.set(url, exists);
            return exists;
        } catch (error) {
            urlCache.set(url, false);
            return false;
        }
    };

    // FUNÇÃO DE TOKENIZAÇÃO CORRIGIDA
    const tokenizeText = (inputText) => {
        const tokens = [];
        let workingText = inputText;
        
        // Primeiro: encontra todos os emojis customizados do Discord
        const discordEmojiMatches = [];
        const discordEmojiRegex = /<a?:(\w+):(\d+)>/g;
        let match;
        
        while ((match = discordEmojiRegex.exec(inputText)) !== null) {
            discordEmojiMatches.push({
                match: match[0],
                start: match.index,
                end: match.index + match[0].length,
                name: match[1],
                id: match[2],
                animated: match[0].startsWith('<a:')
            });
        }
        
        // Ordena por posição
        discordEmojiMatches.sort((a, b) => a.start - b.start);
        
        // Processa texto sequencialmente
        let currentPos = 0;
        
        for (const discordEmoji of discordEmojiMatches) {
            // Adiciona texto antes do emoji do Discord
            if (currentPos < discordEmoji.start) {
                const textBefore = inputText.slice(currentPos, discordEmoji.start);
                if (textBefore) {
                    // Processa emojis Unicode neste texto
                    const unicodeTokens = parseUnicodeEmojis(textBefore);
                    tokens.push(...unicodeTokens);
                }
            }
            
            // Adiciona o emoji customizado do Discord
            tokens.push({
                type: 'emoji',
                content: discordEmoji.match,
                isUnicode: false,
                name: discordEmoji.name,
                id: discordEmoji.id,
                animated: discordEmoji.animated
            });
            
            currentPos = discordEmoji.end;
        }
        
        // Processa texto restante
        if (currentPos < inputText.length) {
            const remainingText = inputText.slice(currentPos);
            if (remainingText) {
                const unicodeTokens = parseUnicodeEmojis(remainingText);
                tokens.push(...unicodeTokens);
            }
        }
        
        // Se não há emojis customizados, processa apenas Unicode
        if (discordEmojiMatches.length === 0) {
            return parseUnicodeEmojis(inputText);
        }
        
        return tokens;
    };

    // Função para processar emojis Unicode
    const parseUnicodeEmojis = (text) => {
        const tokens = [];
        let lastIndex = 0;
        let foundEmojis = [];
        
        // Coleta informações sobre emojis Unicode
        twemoji.parse(text, {
            callback: (icon, options) => {
                foundEmojis.push({
                    start: options.startIndex,
                    end: options.endIndex,
                    icon: icon,
                    char: text.slice(options.startIndex, options.endIndex)
                });
                return '';
            }
        });
        
        // Ordena por posição
        foundEmojis.sort((a, b) => a.start - b.start);
        
        // Processa sequencialmente
        for (const emoji of foundEmojis) {
            // Adiciona texto antes do emoji
            if (lastIndex < emoji.start) {
                const textBefore = text.slice(lastIndex, emoji.start);
                if (textBefore) {
                    tokens.push({ type: 'text', content: textBefore });
                }
            }
            
            // Adiciona o emoji
            tokens.push({
                type: 'emoji',
                content: emoji.char,
                isUnicode: true,
                icon: emoji.icon
            });
            
            lastIndex = emoji.end;
        }
        
        // Adiciona texto restante
        if (lastIndex < text.length) {
            const remaining = text.slice(lastIndex);
            if (remaining) {
                tokens.push({ type: 'text', content: remaining });
            }
        }
        
        // Se não encontrou emojis, retorna como texto simples
        if (foundEmojis.length === 0 && text) {
            return [{ type: 'text', content: text }];
        }
        
        return tokens;
    };

    // Função para medir largura de um token
    const measureToken = (token) => {
        if (token.type === 'emoji') {
            return size;
        } else {
            return canvas.ctx.measureText(token.content).width;
        }
    };

    // Função para medir largura total de tokens
    const measureTokens = (tokens) => {
        return tokens.reduce((total, token) => total + measureToken(token), 0);
    };

    // Função para converter tokens para string (para debug)
    const tokensToString = (tokens) => {
        return tokens.map(token => token.content).join('');
    };

    // Função para quebrar linhas
    const breakIntoLines = (inputText) => {
        if (!maxWidth) {
            return multiline ? inputText.split('\n') : [inputText];
        }

        const lines = [];
        const explicitLines = multiline ? inputText.split('\n') : [inputText];
        
        for (const explicitLine of explicitLines) {
            const tokens = tokenizeText(explicitLine);
            const totalWidth = measureTokens(tokens);
            
            if (totalWidth <= maxWidth) {
                lines.push(explicitLine);
                continue;
            }
            
            // Precisa quebrar a linha
            if (wrap) {
                lines.push(...wrapByWords(tokens));
            } else {
                lines.push(...wrapByCharacters(tokens));
            }
        }
        
        return lines.length > 0 ? lines : [inputText];
    };

    // Função para quebrar por palavras (simplificada)
    const wrapByWords = (tokens) => {
        const lines = [];
        let currentLine = [];
        let currentWidth = 0;
        
        for (const token of tokens) {
            const tokenWidth = measureToken(token);
            
            if (currentWidth + tokenWidth <= maxWidth) {
                currentLine.push(token);
                currentWidth += tokenWidth;
            } else {
                // Finaliza linha atual
                if (currentLine.length > 0) {
                    lines.push(tokensToString(currentLine));
                    currentLine = [];
                    currentWidth = 0;
                }
                
                // Adiciona token à nova linha
                currentLine.push(token);
                currentWidth = tokenWidth;
            }
        }
        
        if (currentLine.length > 0) {
            lines.push(tokensToString(currentLine));
        }
        
        return lines.length > 0 ? lines : [''];
    };

    // Função para quebrar por caracteres (simplificada)
    const wrapByCharacters = (tokens) => {
        const lines = [];
        let currentLine = [];
        let currentWidth = 0;
        
        for (const token of tokens) {
            if (token.type === 'emoji') {
                if (currentWidth + size <= maxWidth) {
                    currentLine.push(token);
                    currentWidth += size;
                } else {
                    if (currentLine.length > 0) {
                        lines.push(tokensToString(currentLine));
                        currentLine = [];
                        currentWidth = 0;
                    }
                    currentLine.push(token);
                    currentWidth = size;
                }
            } else {
                // Para texto, quebra caractere por caractere se necessário
                let remaining = token.content;
                
                while (remaining.length > 0) {
                    let canFit = '';
                    let testWidth = currentWidth;
                    
                    for (let i = 0; i < remaining.length; i++) {
                        const char = remaining[i];
                        const charWidth = canvas.ctx.measureText(char).width;
                        
                        if (testWidth + charWidth <= maxWidth) {
                            canFit += char;
                            testWidth += charWidth;
                        } else {
                            break;
                        }
                    }
                    
                    if (canFit.length > 0) {
                        currentLine.push({ type: 'text', content: canFit });
                        remaining = remaining.slice(canFit.length);
                        currentWidth = testWidth;
                    }
                    
                    if (remaining.length > 0) {
                        if (currentLine.length > 0) {
                            lines.push(tokensToString(currentLine));
                            currentLine = [];
                            currentWidth = 0;
                        }
                        
                        // Força pelo menos um caractere
                        if (canFit.length === 0) {
                            lines.push(remaining[0]);
                            remaining = remaining.slice(1);
                        }
                    }
                }
            }
        }
        
        if (currentLine.length > 0) {
            lines.push(tokensToString(currentLine));
        }
        
        return lines.length > 0 ? lines : [''];
    };

    // Função para obter URL do emoji usando cache
    const getEmojiUrlCached = (emojiChar) => {
        if (emojiUrlCache.has(emojiChar)) {
            return emojiUrlCache.get(emojiChar);
        }
        
        const url = getEmojiUrl(emojiChar);
        emojiUrlCache.set(emojiChar, url);
        return url;
    };

    // Função principal para desenhar uma linha com emojis e texto
    const drawMixedLine = async (lineText, lineX, lineY) => {
        const tokens = tokenizeText(lineText);
        let cursorX = lineX;

        console.log(`Desenhando linha: "${lineText}"`);
        console.log(`Tokens encontrados:`, tokens.map(t => ({ type: t.type, content: t.content })));

        for (const token of tokens) {
            if (token.type === 'emoji') {
                let url = null;
                let fallbackText = token.content;
                
                try {
                    if (!token.isUnicode) {
                        // Emoji customizado do Discord
                        const ext = token.animated ? 'gif' : 'png';
                        url = `https://cdn.discordapp.com/emojis/${token.id}.${ext}`;
                        fallbackText = `:${token.name}:`;
                    } else {
                        // Emoji Unicode
                        url = getEmojiUrlCached(token.content);
                        fallbackText = token.content;
                    }

                    if (url) {
                        const urlExists = await checkUrl(url);
                        
                        if (urlExists) {
                            const img = await __1.CanvasUtil.resolveImage(this, ctx, url);
                            if (img instanceof forgescript_1.Return) return img;
                            
                            // Desenha emoji como imagem
                            canvas.ctx.drawImage(
                                img,
                                cursorX,
                                lineY - size + (size * 0.2),
                                size,
                                size
                            );
                            cursorX += size;
                            continue;
                        }
                    }
                } catch (error) {
                    console.warn(`Erro ao carregar emoji: ${url}`, error);
                }
                
                // Fallback: desenha como texto
                if (mode === __1.FillOrStroke.fill) {
                    canvas.ctx.fillText(fallbackText, cursorX, lineY);
                } else {
                    canvas.ctx.strokeText(fallbackText, cursorX, lineY);
                }
                cursorX += canvas.ctx.measureText(fallbackText).width;
                
            } else {
                // Token de texto normal  
                if (mode === __1.FillOrStroke.fill) {
                    canvas.ctx.fillText(token.content, cursorX, lineY);
                } else {
                    canvas.ctx.strokeText(token.content, cursorX, lineY);
                }
                cursorX += canvas.ctx.measureText(token.content).width;
            }
        }
    };

    // Quebra o texto em linhas e desenha
    const lines = breakIntoLines(text);

    try {
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const lineText = lines[lineIndex];
            const lineY = y + (lineIndex * actualLineOffset);
            
            await drawMixedLine(lineText, x, lineY);
        }
    } catch (error) {
        console.error('Erro ao desenhar linhas:', error);
        // Fallback: desenha o texto original
        if (mode === __1.FillOrStroke.fill) {
            canvas.ctx.fillText(text, x, y);
        } else {
            canvas.ctx.strokeText(text, x, y);
        }
    }

    // Restore style
    canvas.ctx[styleProp] = prevStyle;
    return this.success();
}
});
