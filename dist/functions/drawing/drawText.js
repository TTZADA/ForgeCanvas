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
    description: 'Draws a filled/stroked text on a canvas or GIF frames.',
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
        {
            name: 'gif',
            description: 'Whether to apply to GIF frames (default: false).',
            type: forgescript_1.ArgType.Boolean,
            required: false,
            rest: false
        }
    ],
async execute(ctx, [canvasName, mode, text, font, style, x, y, emojiSize, maxWidth, multiline, wrap, lineOffset, gif = false]) {
    // Se for para GIF, processa todos os frames
    if (gif) {
        const encoder = canvasName
            ? ctx.gifManager?.getEncoder(canvasName)
            : ctx.gifManager?.lastCurrentEncoder;
            
        if (!encoder) return this.customError(__1.FCError.NoEncoder);
        
        // Aplica o drawText em todos os frames existentes do encoder
        const frames = encoder.frames || [];
        
        for (let frameIndex = 0; frameIndex < frames.length; frameIndex++) {
            const frame = frames[frameIndex];
            
            // Cria um canvas temporário para este frame
            const { createCanvas } = require('@napi-rs/canvas');
            const tempCanvas = createCanvas(frame.width || 800, frame.height || 600);
            const tempCtx = tempCanvas.getContext('2d');
            
            // Se o frame tem dados de imagem, desenha primeiro
            if (frame.imageData) {
                const imageData = tempCtx.createImageData(frame.width, frame.height);
                imageData.data.set(frame.imageData);
                tempCtx.putImageData(imageData, 0, 0);
            }
            
            // Aplica as configurações de texto
            await this.drawTextOnContext(tempCtx, {
                mode, text, font, style, x, y, emojiSize, 
                maxWidth, multiline, wrap, lineOffset
            }, ctx);
            
            // Atualiza os dados do frame
            const newImageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
            frame.imageData = new Uint8Array(newImageData.data);
        }
        
        return this.success();
    }
    
    // Comportamento original para canvas normal
    const canvas = canvasName
        ? ctx.canvasManager?.get(canvasName)
        : ctx.canvasManager?.lastCurrent;
    if (!canvas) return this.customError(__1.FCError.NoCanvas);

    await this.drawTextOnContext(canvas.ctx, {
        mode, text, font, style, x, y, emojiSize, 
        maxWidth, multiline, wrap, lineOffset
    }, ctx);

    return this.success();
},

// Método separado para desenhar texto em qualquer contexto
async drawTextOnContext(canvasCtx, options, ctx) {
    const { mode, text, font, style, x, y, emojiSize, maxWidth, multiline, wrap, lineOffset } = options;
    
    // Apply font and style
    if (font) canvasCtx.font = font;
    const styleProp = mode === __1.FillOrStroke.fill ? 'fillStyle' : 'strokeStyle';
    const prevStyle = canvasCtx[styleProp];
    const resolved = style
        ? await __1.CanvasUtil.resolveStyle(this, ctx, { ctx: canvasCtx }, style)
        : null;
    if (resolved instanceof forgescript_1.Return) return resolved;
    if (resolved) canvasCtx[styleProp] = resolved;

    // Determine emoji draw size
    const size = emojiSize || parseInt(canvasCtx.font) || 16;
    const actualLineOffset = lineOffset || size * 1.2; // Default line spacing

    // Regex para capturar emojis Discord e Unicode
    const emojiRegex = /<a?:(\w+):(\d+)>|(?:(?!\p{Emoji_Modifier})\p{Extended_Pictographic}(?:\u200D(?!\p{Emoji_Modifier})\p{Extended_Pictographic})*|\p{Regional_Indicator}{2}|\d\uFE0F\u20E3|[#*]\uFE0F\u20E3)/gu;

    // ETAPA 1: COLETAR TODOS OS EMOJIS DO TEXTO COMPLETO
    const collectAllEmojis = (inputText) => {
        const emojiMap = new Map();
        let match;
        emojiRegex.lastIndex = 0;
        
        while ((match = emojiRegex.exec(inputText))) {
            const emojiText = match[0];
            if (!emojiMap.has(emojiText)) {
                emojiMap.set(emojiText, null); // Será preenchido com a URL processada
            }
        }
        
        return emojiMap;
    };

    // ETAPA 2: PROCESSAR TODOS OS EMOJIS COLETADOS
    const processCollectedEmojis = async (emojiMap) => {
        const processedEmojis = new Map();
        
        // Processa cada emoji único encontrado
        for (const [emojiText] of emojiMap) {
            let url = null;
            let fallbackText = emojiText;
            let isDiscordEmoji = false;
            
            // Verifica se é emoji do Discord
            const discordMatch = emojiText.match(/<a?:(\w+):(\d+)>/);
            if (discordMatch) {
                const [, emojiName, emojiId] = discordMatch;
                const ext = emojiText.startsWith('<a:') ? 'gif' : 'png';
                url = `https://cdn.discordapp.com/emojis/${emojiId}.${ext}`;
                fallbackText = emojiName;
                isDiscordEmoji = true;
            } else {
                // Para emojis Unicode, usa getEmojiUrl com o emoji INTEIRO
                url = getEmojiUrl(emojiText);
            }
            
            // Tenta carregar a imagem se há URL
            let loadedImage = null;
            if (url) {
                try {
                    const response = await fetch(url, { method: 'HEAD' });
                    if (response.ok) {
                        const img = await __1.CanvasUtil.resolveImage(this, ctx, url);
                        if (!(img instanceof forgescript_1.Return)) {
                            loadedImage = img;
                        }
                    }
                } catch (error) {
                    console.warn(`Failed to load emoji: ${url}`, error);
                }
            }
            
            processedEmojis.set(emojiText, {
                url,
                image: loadedImage,
                fallbackText,
                isDiscordEmoji
            });
        }
        
        return processedEmojis;
    };

    // Coleta todos os emojis do texto
    const emojiMap = collectAllEmojis(text);
    
    // Processa todos os emojis coletados
    const processedEmojis = await processCollectedEmojis(emojiMap);

    // Função para tokenizar o texto separando emojis de texto normal
    const tokenizeText = (inputText) => {
        const tokens = [];
        let lastIndex = 0;
        let match;
        
        emojiRegex.lastIndex = 0;
        
        while ((match = emojiRegex.exec(inputText))) {
            if (match.index > lastIndex) {
                const textSegment = inputText.slice(lastIndex, match.index);
                if (textSegment) {
                    tokens.push({ type: 'text', content: textSegment });
                }
            }
            
            tokens.push({ type: 'emoji', content: match[0] });
            lastIndex = emojiRegex.lastIndex;
        }
        
        if (lastIndex < inputText.length) {
            const remaining = inputText.slice(lastIndex);
            if (remaining) {
                tokens.push({ type: 'text', content: remaining });
            }
        }
        
        return tokens;
    };

    // Função para medir largura de um token
    const measureToken = (token) => {
        if (token.type === 'emoji') {
            return size;
        } else {
            return canvasCtx.measureText(token.content).width;
        }
    };

    // Função para medir largura de uma array de tokens
    const measureTokens = (tokens) => {
        return tokens.reduce((total, token) => total + measureToken(token), 0);
    };

    // Função para converter tokens para string
    const tokensToString = (tokens) => {
        return tokens.map(token => token.content).join('');
    };

    // Função melhorada para quebrar linhas respeitando wrap
    const breakIntoLines = (inputText) => {
        try {
            if (!maxWidth) {
                return [inputText];
            }

            const lines = [];
            const explicitLines = multiline ? inputText.split('\n') : [inputText];
            
            for (const explicitLine of explicitLines) {
                const tokens = tokenizeText(explicitLine);
                
                if (tokens.length === 0) {
                    lines.push('');
                    continue;
                }
                
                const totalWidth = measureTokens(tokens);
                
                if (totalWidth <= maxWidth) {
                    lines.push(explicitLine);
                    continue;
                }
                
                // Precisa quebrar a linha
                if (wrap) {
                    // Quebra por palavras, respeitando emojis
                    const processedLines = wrapByWords(tokens);
                    lines.push(...processedLines);
                } else {
                    // Quebra forçada por caracteres
                    const processedLines = wrapByCharacters(tokens);
                    lines.push(...processedLines);
                }
            }
            
            return lines.length > 0 ? lines : [inputText];
            
        } catch (error) {
            console.warn('Error in breakIntoLines:', error);
            return [inputText];
        }
    };

    // Função para quebrar por palavras (wrap = true)
    const wrapByWords = (tokens) => {
        const lines = [];
        let currentTokens = [];
        let currentWidth = 0;
        
        // Agrupa tokens em "palavras" (sequências separadas por espaços)
        const words = groupTokensIntoWords(tokens);
        
        for (const word of words) {
            const wordWidth = measureTokens(word);
            
            // Se a palavra cabe na linha atual
            if (currentWidth + wordWidth <= maxWidth) {
                currentTokens.push(...word);
                currentWidth += wordWidth;
            } else {
                // Palavra não cabe
                if (currentTokens.length > 0) {
                    // Finaliza linha atual
                    lines.push(tokensToString(currentTokens));
                    currentTokens = [];
                    currentWidth = 0;
                }
                
                // Se a palavra é muito grande para caber sozinha
                if (wordWidth > maxWidth) {
                    const brokenLines = forceBreakWord(word);
                    lines.push(...brokenLines.slice(0, -1));
                    
                    const lastLine = brokenLines[brokenLines.length - 1];
                    if (lastLine) {
                        const lastTokens = tokenizeText(lastLine);
                        currentTokens = lastTokens;
                        currentWidth = measureTokens(lastTokens);
                    }
                } else {
                    // Palavra cabe sozinha
                    currentTokens = [...word];
                    currentWidth = wordWidth;
                }
            }
        }
        
        if (currentTokens.length > 0) {
            lines.push(tokensToString(currentTokens));
        }
        
        return lines.length > 0 ? lines : [''];
    };

    // Função para quebrar por caracteres (wrap = false)
    const wrapByCharacters = (tokens) => {
        const lines = [];
        let currentTokens = [];
        let currentWidth = 0;
        
        for (const token of tokens) {
            const tokenWidth = measureToken(token);
            
            if (token.type === 'emoji') {
                // Emoji não pode ser quebrado
                if (currentWidth + tokenWidth <= maxWidth) {
                    currentTokens.push(token);
                    currentWidth += tokenWidth;
                } else {
                    if (currentTokens.length > 0) {
                        lines.push(tokensToString(currentTokens));
                        currentTokens = [];
                        currentWidth = 0;
                    }
                    currentTokens.push(token);
                    currentWidth = tokenWidth;
                }
            } else {
                // Texto pode ser quebrado caractere por caractere
                let remainingText = token.content;
                
                while (remainingText.length > 0) {
                    let canFit = '';
                    let testWidth = currentWidth;
                    
                    for (let i = 0; i < remainingText.length; i++) {
                        const char = remainingText[i];
                        const charWidth = canvasCtx.measureText(char).width;
                        
                        if (testWidth + charWidth <= maxWidth) {
                            canFit += char;
                            testWidth += charWidth;
                        } else {
                            break;
                        }
                    }
                    
                    if (canFit.length > 0) {
                        currentTokens.push({ type: 'text', content: canFit });
                        remainingText = remainingText.slice(canFit.length);
                        currentWidth = testWidth;
                    }
                    
                    if (remainingText.length > 0) {
                        if (currentTokens.length > 0) {
                            lines.push(tokensToString(currentTokens));
                            currentTokens = [];
                            currentWidth = 0;
                        }
                        
                        // Força pelo menos um caractere se nada coube
                        if (canFit.length === 0) {
                            lines.push(remainingText[0]);
                            remainingText = remainingText.slice(1);
                        }
                    }
                }
            }
        }
        
        if (currentTokens.length > 0) {
            lines.push(tokensToString(currentTokens));
        }
        
        return lines.length > 0 ? lines : [''];
    };

    // Função para agrupar tokens em palavras
    const groupTokensIntoWords = (tokens) => {
        const words = [];
        let currentWord = [];
        
        for (const token of tokens) {
            if (token.type === 'emoji') {
                currentWord.push(token);
            } else {
                // Divide texto por espaços, mantendo os espaços como separadores
                const parts = token.content.split(/(\s+)/);
                
                for (let i = 0; i < parts.length; i++) {
                    const part = parts[i];
                    
                    if (part.trim() === '') {
                        // É um espaço - finaliza palavra atual se houver
                        if (currentWord.length > 0) {
                            words.push([...currentWord]);
                            currentWord = [];
                        }
                        // Adiciona o espaço como uma "palavra" separada
                        if (part) {
                            words.push([{ type: 'text', content: part }]);
                        }
                    } else {
                        // É texto - adiciona à palavra atual
                        currentWord.push({ type: 'text', content: part });
                    }
                }
            }
        }
        
        if (currentWord.length > 0) {
            words.push(currentWord);
        }
        
        return words;
    };

    // Função para quebrar uma palavra muito grande forçadamente
    const forceBreakWord = (wordTokens) => {
        const lines = [];
        let currentTokens = [];
        let currentWidth = 0;
        
        for (const token of wordTokens) {
            if (token.type === 'emoji') {
                if (currentWidth + size <= maxWidth) {
                    currentTokens.push(token);
                    currentWidth += size;
                } else {
                    if (currentTokens.length > 0) {
                        lines.push(tokensToString(currentTokens));
                        currentTokens = [];
                        currentWidth = 0;
                    }
                    currentTokens.push(token);
                    currentWidth = size;
                }
            } else {
                let remainingText = token.content;
                
                while (remainingText.length > 0) {
                    let canFit = '';
                    let testWidth = currentWidth;
                    
                    for (let i = 0; i < remainingText.length; i++) {
                        const char = remainingText[i];
                        const charWidth = canvasCtx.measureText(char).width;
                        
                        if (testWidth + charWidth <= maxWidth) {
                            canFit += char;
                            testWidth += charWidth;
                        } else {
                            break;
                        }
                    }
                    
                    if (canFit.length > 0) {
                        currentTokens.push({ type: 'text', content: canFit });
                        remainingText = remainingText.slice(canFit.length);
                        currentWidth = testWidth;
                    }
                    
                    if (remainingText.length > 0) {
                        if (currentTokens.length > 0) {
                            lines.push(tokensToString(currentTokens));
                            currentTokens = [];
                            currentWidth = 0;
                        }
                        
                        if (canFit.length === 0) {
                            lines.push(remainingText[0]);
                            remainingText = remainingText.slice(1);
                        }
                    }
                }
            }
        }
        
        if (currentTokens.length > 0) {
            lines.push(tokensToString(currentTokens));
        }
        
        return lines.length > 0 ? lines : [''];
    };

    // Split text into lines using improved logic
    const lines = breakIntoLines(text);

    // ETAPA 3: DESENHAR COM EMOJIS PRÉ-PROCESSADOS
    const drawMixedLine = async (lineText, lineX, lineY) => {
        try {
            const tokens = tokenizeText(lineText);
            let cursorX = lineX;

            // Percorre cada token da linha
            for (const token of tokens) {
                if (token.type === 'emoji') {
                    const emojiText = token.content;
                    const emojiData = processedEmojis.get(emojiText);
                    
                    if (emojiData && emojiData.image) {
                        // Desenha a imagem do emoji já carregada
                        canvasCtx.drawImage(
                            emojiData.image,
                            cursorX,
                            lineY - size + (size * 0.2),
                            size,
                            size
                        );
                        cursorX += size;
                    } else {
                        // Fallback: desenha como texto
                        const fallbackText = emojiData ? emojiData.fallbackText : emojiText;
                        if (mode === __1.FillOrStroke.fill) {
                            canvasCtx.fillText(fallbackText, cursorX, lineY);
                        } else {
                            canvasCtx.strokeText(fallbackText, cursorX, lineY);
                        }
                        cursorX += canvasCtx.measureText(fallbackText).width;
                    }
                } else {
                    // Token de texto normal
                    if (mode === __1.FillOrStroke.fill) {
                        canvasCtx.fillText(token.content, cursorX, lineY);
                    } else {
                        canvasCtx.strokeText(token.content, cursorX, lineY);
                    }
                    cursorX += canvasCtx.measureText(token.content).width;
                }
            }
        } catch (error) {
            console.warn('Error in drawMixedLine:', error);
            // Fallback: desenha a linha inteira como texto
            if (mode === __1.FillOrStroke.fill) {
                canvasCtx.fillText(lineText, lineX, lineY);
            } else {
                canvasCtx.strokeText(lineText, lineX, lineY);
            }
        }
    };

    // Draw each line
    try {
        for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
            const lineText = lines[lineIndex];
            const lineY = y + (lineIndex * actualLineOffset);
            
            await drawMixedLine(lineText, x, lineY);
        }
    } catch (error) {
        console.warn('Error drawing lines:', error);
        // Fallback final: desenha o texto original
        if (mode === __1.FillOrStroke.fill) {
            canvasCtx.fillText(text, x, y);
        } else {
            canvasCtx.strokeText(text, x, y);
        }
    }

    // Restore style
    canvasCtx[styleProp] = prevStyle;
}
});
