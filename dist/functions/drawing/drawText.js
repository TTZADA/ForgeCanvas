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

    // FUNÇÃO PRINCIPAL DE TOKENIZAÇÃO - CORRIGIDA E MELHORADA
    const tokenizeText = (inputText) => {
        const tokens = [];
        
        // Primeiro passa: processa emojis do Discord
        let processedText = inputText;
        const discordEmojiRegex = /<a?:(\w+):(\d+)>/g;
        const discordPlaceholders = [];
        let match;
        
        // Substitui emojis do Discord por placeholders únicos
        let placeholderIndex = 0;
        while ((match = discordEmojiRegex.exec(inputText)) !== null) {
            const placeholder = `__DISCORD_EMOJI_${placeholderIndex}__`;
            discordPlaceholders.push({
                placeholder: placeholder,
                emoji: match[0]
            });
            processedText = processedText.replace(match[0], placeholder);
            placeholderIndex++;
        }
        
        // Segunda passa: processa emojis Unicode usando twemoji
        let lastIndex = 0;
        
        twemoji.parse(processedText, {
            callback: (icon, options, variant) => {
                // Adiciona texto antes do emoji
                if (options.startIndex > lastIndex) {
                    const textBefore = processedText.slice(lastIndex, options.startIndex);
                    if (textBefore) {
                        // Verifica se contém placeholders do Discord
                        const textTokens = processDiscordPlaceholders(textBefore, discordPlaceholders);
                        tokens.push(...textTokens);
                    }
                }
                
                // Adiciona o emoji Unicode
                const emojiChar = processedText.slice(options.startIndex, options.endIndex);
                tokens.push({ type: 'emoji', content: emojiChar, isUnicode: true });
                
                lastIndex = options.endIndex;
                return '';
            }
        });
        
        // Adiciona texto restante
        if (lastIndex < processedText.length) {
            const remaining = processedText.slice(lastIndex);
            if (remaining) {
                const textTokens = processDiscordPlaceholders(remaining, discordPlaceholders);
                tokens.push(...textTokens);
            }
        }
        
        // Se não encontrou nenhum emoji Unicode, processa todo o texto para Discord
        if (tokens.length === 0) {
            const textTokens = processDiscordPlaceholders(processedText, discordPlaceholders);
            return textTokens.length > 0 ? textTokens : [{ type: 'text', content: inputText }];
        }
        
        return tokens;
    };

    // Função auxiliar para processar placeholders do Discord
    const processDiscordPlaceholders = (text, discordPlaceholders) => {
        if (!discordPlaceholders.length) {
            return text ? [{ type: 'text', content: text }] : [];
        }
        
        const tokens = [];
        let remaining = text;
        
        for (const { placeholder, emoji } of discordPlaceholders) {
            const parts = remaining.split(placeholder);
            
            if (parts.length > 1) {
                // Encontrou o placeholder
                if (parts[0]) {
                    tokens.push({ type: 'text', content: parts[0] });
                }
                tokens.push({ type: 'emoji', content: emoji, isUnicode: false });
                remaining = parts.slice(1).join(placeholder);
            }
        }
        
        if (remaining) {
            tokens.push({ type: 'text', content: remaining });
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

    // Função para converter tokens para string
    const tokensToString = (tokens) => {
        return tokens.map(token => token.content).join('');
    };

    // Função simplificada para quebrar linhas
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
                // Quebra por palavras
                lines.push(...wrapByWords(tokens));
            } else {
                // Quebra por caracteres
                lines.push(...wrapByCharacters(tokens));
            }
        }
        
        return lines.length > 0 ? lines : [inputText];
    };

    // Função para quebrar por palavras
    const wrapByWords = (tokens) => {
        const lines = [];
        let currentLine = [];
        let currentWidth = 0;
        
        let i = 0;
        while (i < tokens.length) {
            const token = tokens[i];
            
            if (token.type === 'emoji') {
                // Emoji não pode ser quebrado
                if (currentWidth + size <= maxWidth) {
                    currentLine.push(token);
                    currentWidth += size;
                } else {
                    // Finaliza linha atual
                    if (currentLine.length > 0) {
                        lines.push(tokensToString(currentLine));
                        currentLine = [];
                        currentWidth = 0;
                    }
                    currentLine.push(token);
                    currentWidth = size;
                }
                i++;
            } else {
                // Processo texto palavra por palavra
                const words = token.content.split(/(\s+)/);
                for (const word of words) {
                    if (!word) continue;
                    
                    const wordWidth = canvas.ctx.measureText(word).width;
                    
                    if (currentWidth + wordWidth <= maxWidth) {
                        currentLine.push({ type: 'text', content: word });
                        currentWidth += wordWidth;
                    } else {
                        // Palavra não cabe
                        if (currentLine.length > 0) {
                            lines.push(tokensToString(currentLine));
                            currentLine = [];
                            currentWidth = 0;
                        }
                        
                        if (wordWidth > maxWidth) {
                            // Palavra muito grande, quebra forçadamente
                            const brokenLines = forceBreakText(word);
                            lines.push(...brokenLines.slice(0, -1));
                            const lastLine = brokenLines[brokenLines.length - 1];
                            if (lastLine) {
                                currentLine.push({ type: 'text', content: lastLine });
                                currentWidth = canvas.ctx.measureText(lastLine).width;
                            }
                        } else {
                            currentLine.push({ type: 'text', content: word });
                            currentWidth = wordWidth;
                        }
                    }
                }
                i++;
            }
        }
        
        if (currentLine.length > 0) {
            lines.push(tokensToString(currentLine));
        }
        
        return lines.length > 0 ? lines : [''];
    };

    // Função para quebrar por caracteres
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
                // Quebra texto caractere por caractere
                let remainingText = token.content;
                
                while (remainingText.length > 0) {
                    let canFit = '';
                    let testWidth = currentWidth;
                    
                    for (let i = 0; i < remainingText.length; i++) {
                        const char = remainingText[i];
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
                        remainingText = remainingText.slice(canFit.length);
                        currentWidth = testWidth;
                    }
                    
                    if (remainingText.length > 0) {
                        if (currentLine.length > 0) {
                            lines.push(tokensToString(currentLine));
                            currentLine = [];
                            currentWidth = 0;
                        }
                        
                        // Força pelo menos um caractere
                        if (canFit.length === 0) {
                            lines.push(remainingText[0]);
                            remainingText = remainingText.slice(1);
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

    // Função auxiliar para quebrar texto forçadamente
    const forceBreakText = (text) => {
        const lines = [];
        let remaining = text;
        
        while (remaining.length > 0) {
            let canFit = '';
            let testWidth = 0;
            
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
                lines.push(canFit);
                remaining = remaining.slice(canFit.length);
            } else {
                // Força pelo menos um caractere
                lines.push(remaining[0]);
                remaining = remaining.slice(1);
            }
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

        for (const token of tokens) {
            if (token.type === 'emoji') {
                const emojiContent = token.content;
                let url = null;
                let fallbackText = emojiContent;
                
                // Verifica se é emoji do Discord
                if (!token.isUnicode && emojiContent.match(/<a?:(\w+):(\d+)>/)) {
                    const discordMatch = emojiContent.match(/<a?:(\w+):(\d+)>/);
                    const [, emojiName, emojiId] = discordMatch;
                    const ext = emojiContent.startsWith('<a:') ? 'gif' : 'png';
                    url = `https://cdn.discordapp.com/emojis/${emojiId}.${ext}`;
                    fallbackText = `:${emojiName}:`;
                } else {
                    // Emoji Unicode - usa o emoji inteiro para getEmojiUrl
                    url = getEmojiUrlCached(emojiContent);
                    fallbackText = emojiContent;
                }

                if (url) {
                    try {
                        const urlExists = await checkUrl(url);
                        
                        if (urlExists) {
                            const img = await __1.CanvasUtil.resolveImage(this, ctx, url);
                            if (img instanceof forgescript_1.Return) return img;
                            
                            canvas.ctx.drawImage(
                                img,
                                cursorX,
                                lineY - size + (size * 0.2),
                                size,
                                size
                            );
                            cursorX += size;
                        } else {
                            // URL não existe, desenha texto de fallback
                            if (mode === __1.FillOrStroke.fill) {
                                canvas.ctx.fillText(fallbackText, cursorX, lineY);
                            } else {
                                canvas.ctx.strokeText(fallbackText, cursorX, lineY);
                            }
                            cursorX += canvas.ctx.measureText(fallbackText).width;
                        }
                    } catch (error) {
                        console.warn(`Failed to load emoji: ${url}`, error);
                        // Em caso de erro, desenha texto de fallback
                        if (mode === __1.FillOrStroke.fill) {
                            canvas.ctx.fillText(fallbackText, cursorX, lineY);
                        } else {
                            canvas.ctx.strokeText(fallbackText, cursorX, lineY);
                        }
                        cursorX += canvas.ctx.measureText(fallbackText).width;
                    }
                } else {
                    // Sem URL, desenha como texto
                    if (mode === __1.FillOrStroke.fill) {
                        canvas.ctx.fillText(fallbackText, cursorX, lineY);
                    } else {
                        canvas.ctx.strokeText(fallbackText, cursorX, lineY);
                    }
                    cursorX += canvas.ctx.measureText(fallbackText).width;
                }
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
        console.warn('Error drawing lines:', error);
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
})
