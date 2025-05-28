"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const __1 = require("../..");

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
    const actualLineOffset = lineOffset || size * 1.2; // Default line spacing

    // Helper function to check if URL exists (with cache)
    const urlCache = new Map();
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

    // Regex completa para capturar emojis Discord e TODOS os emojis Unicode
    const emojiRegex = /<a?:(\w+):(\d+)>|((?:\p{Extended_Pictographic}(?:\u200D(?:\p{Extended_Pictographic})?)*)|\d\uFE0F\u20E3)/gu;

    // Função para tokenizar o texto separando emojis de texto normal
    const tokenizeText = (inputText) => {
        const tokens = [];
        let lastIndex = 0;
        let match;
        
        // Reset regex
        emojiRegex.lastIndex = 0;
        
        while ((match = emojiRegex.exec(inputText))) {
            // Add text before emoji
            if (match.index > lastIndex) {
                const textSegment = inputText.slice(lastIndex, match.index);
                if (textSegment) {
                    tokens.push({ type: 'text', content: textSegment });
                }
            }
            
            // Add emoji
            tokens.push({ type: 'emoji', content: match[0] });
            lastIndex = emojiRegex.lastIndex;
        }
        
        // Add remaining text
        if (lastIndex < inputText.length) {
            const remaining = inputText.slice(lastIndex);
            if (remaining) {
                tokens.push({ type: 'text', content: remaining });
            }
        }
        
        return tokens;
    };

    // Função para medir a largura de um token
    const measureToken = (token) => {
        if (token.type === 'emoji') {
            return size;
        } else {
            return canvas.ctx.measureText(token.content).width;
        }
    };

    // Função para medir a largura total de uma array de tokens
    const measureTokens = (tokens) => {
        return tokens.reduce((total, token) => total + measureToken(token), 0);
    };

    // Função melhorada para quebrar linhas
    const breakIntoLines = (inputText) => {
        try {
            // Se não há maxWidth definido, retorna o texto como uma linha
            if (!maxWidth) {
                return [inputText];
            }

            const lines = [];
            
            // Primeiro, quebra por quebras de linha explícitas se multiline estiver ativo
            const explicitLines = multiline ? inputText.split('\n') : [inputText];
            
            for (const explicitLine of explicitLines) {
                // Tokeniza a linha
                const tokens = tokenizeText(explicitLine);
                
                if (tokens.length === 0) {
                    lines.push('');
                    continue;
                }
                
                // Mede a largura total da linha
                const totalWidth = measureTokens(tokens);
                
                // Se a linha cabe, adiciona diretamente
                if (totalWidth <= maxWidth) {
                    lines.push(explicitLine);
                    continue;
                }
                
                // Precisa quebrar a linha
                if (wrap) {
                    // Quebra por palavras
                    const words = explicitLine.split(' ');
                    let currentLine = '';
                    
                    for (const word of words) {
                        const testLine = currentLine ? `${currentLine} ${word}` : word;
                        const testTokens = tokenizeText(testLine);
                        const testWidth = measureTokens(testTokens);
                        
                        if (testWidth <= maxWidth) {
                            currentLine = testLine;
                        } else {
                            // A palavra não cabe na linha atual
                            if (currentLine) {
                                lines.push(currentLine);
                                currentLine = word;
                                
                                // Verifica se a palavra sozinha cabe
                                const wordTokens = tokenizeText(word);
                                const wordWidth = measureTokens(wordTokens);
                                
                                if (wordWidth > maxWidth) {
                                    // Precisa quebrar a palavra por caracteres/tokens
                                    const brokenLines = breakTokensByWidth(wordTokens, maxWidth);
                                    lines.push(...brokenLines.slice(0, -1));
                                    currentLine = brokenLines[brokenLines.length - 1] || '';
                                }
                            } else {
                                // Primeira palavra da linha não cabe, quebra por caracteres/tokens
                                const wordTokens = tokenizeText(word);
                                const brokenLines = breakTokensByWidth(wordTokens, maxWidth);
                                lines.push(...brokenLines.slice(0, -1));
                                currentLine = brokenLines[brokenLines.length - 1] || '';
                            }
                        }
                    }
                    
                    if (currentLine) {
                        lines.push(currentLine);
                    }
                } else {
                    // Quebra por caracteres/tokens
                    const brokenLines = breakTokensByWidth(tokens, maxWidth);
                    lines.push(...brokenLines);
                }
            }
            
            return lines.length > 0 ? lines : [inputText];
            
        } catch (error) {
            console.warn('Error in breakIntoLines:', error);
            return [inputText]; // Fallback
        }
    };

    // Função para agrupar tokens que devem ficar juntos (grupos pequenos e inteligentes)
    const groupTokens = (tokens) => {
        const groups = [];
        
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            const nextToken = tokens[i + 1];
            const prevToken = tokens[i - 1];
            
            if (token.type === 'emoji') {
                const group = [];
                
                // Verifica se deve incluir texto imediatamente antes (máximo uma palavra)
                if (prevToken && prevToken.type === 'text') {
                    const prevWords = prevToken.content.trim().split(' ');
                    const lastWord = prevWords[prevWords.length - 1];
                    
                    // Se a palavra anterior é pequena (até 10 caracteres), inclui no grupo
                    if (lastWord && lastWord.length <= 10) {
                        // Remove a última palavra do token anterior
                        const remainingText = prevWords.slice(0, -1).join(' ');
                        if (remainingText.trim()) {
                            // Modifica o grupo anterior para ter apenas o texto restante
                            if (groups.length > 0) {
                                const lastGroup = groups[groups.length - 1];
                                if (lastGroup.length === 1 && lastGroup[0].type === 'text') {
                                    lastGroup[0].content = remainingText + ' ';
                                }
                            }
                        } else {
                            // Remove o grupo anterior completamente se estava vazio
                            if (groups.length > 0) {
                                groups.pop();
                            }
                        }
                        
                        group.push({ type: 'text', content: lastWord });
                    }
                }
                
                // Adiciona o emoji
                group.push(token);
                
                // Verifica se deve incluir texto imediatamente depois (máximo uma palavra)
                if (nextToken && nextToken.type === 'text') {
                    const nextWords = nextToken.content.trim().split(' ');
                    const firstWord = nextWords[0];
                    
                    // Se a próxima palavra é pequena (até 10 caracteres), inclui no grupo
                    if (firstWord && firstWord.length <= 10) {
                        group.push({ type: 'text', content: firstWord });
                        
                        // Modifica o próximo token para ter apenas o texto restante
                        const remainingText = nextWords.slice(1).join(' ');
                        if (remainingText.trim()) {
                            nextToken.content = ' ' + remainingText;
                        } else {
                            // Marca o próximo token para ser pulado
                            tokens[i + 1] = null;
                        }
                        
                        i++; // Pula o próximo token se foi processado
                    }
                }
                
                groups.push(group);
            }
            else if (token.type === 'text') {
                // Quebra texto em palavras individuais
                const words = token.content.trim().split(/(\s+)/); // Preserva espaços
                
                for (const word of words) {
                    if (word.trim()) {
                        groups.push([{ type: 'text', content: word }]);
                    } else if (word) {
                        // Espaços
                        groups.push([{ type: 'text', content: word }]);
                    }
                }
            }
        }
        
        // Remove grupos nulos
        return groups.filter(group => group && group.length > 0);
    };

    // Função para quebrar grupos por largura máxima
    const breakTokensByWidth = (tokens, maxWidth) => {
        const lines = [];
        let currentLineGroups = [];
        let currentWidth = 0;
        
        try {
            const groups = groupTokens(tokens);
            
            for (const group of groups) {
                const groupWidth = measureTokens(group);
                
                // Se o grupo não cabe na linha atual e a linha não está vazia
                if (currentWidth + groupWidth > maxWidth && currentLineGroups.length > 0) {
                    // Finaliza a linha atual
                    const currentLineTokens = currentLineGroups.flat();
                    lines.push(tokensToString(currentLineTokens));
                    
                    // Inicia nova linha com o grupo atual
                    currentLineGroups = [group];
                    currentWidth = groupWidth;
                }
                // Se o grupo é muito grande para caber em uma linha sozinho
                else if (groupWidth > maxWidth) {
                    // Se há conteúdo na linha atual, finaliza primeiro
                    if (currentLineGroups.length > 0) {
                        const currentLineTokens = currentLineGroups.flat();
                        lines.push(tokensToString(currentLineTokens));
                        currentLineGroups = [];
                        currentWidth = 0;
                    }
                    
                    // Quebra o grupo forçadamente (apenas texto pode ser quebrado)
                    const brokenLines = breakLargeGroup(group, maxWidth);
                    lines.push(...brokenLines.slice(0, -1));
                    
                    // A última linha pode ter sobrado conteúdo
                    const lastLine = brokenLines[brokenLines.length - 1];
                    if (lastLine && lastLine.trim()) {
                        const lastTokens = tokenizeText(lastLine);
                        currentLineGroups = [lastTokens];
                        currentWidth = measureTokens(lastTokens);
                    }
                }
                else {
                    // Grupo cabe na linha atual
                    currentLineGroups.push(group);
                    currentWidth += groupWidth;
                }
            }
            
            // Adiciona a última linha se houver conteúdo
            if (currentLineGroups.length > 0) {
                const currentLineTokens = currentLineGroups.flat();
                lines.push(tokensToString(currentLineTokens));
            }
            
            return lines.length > 0 ? lines : [''];
            
        } catch (error) {
            console.warn('Error in breakTokensByWidth:', error);
            return [tokensToString(tokens)]; // Fallback
        }
    };

    // Função para quebrar grupos muito grandes (força quebra apenas em texto)
    const breakLargeGroup = (group, maxWidth) => {
        const lines = [];
        let currentTokens = [];
        let currentWidth = 0;
        
        for (const token of group) {
            if (token.type === 'emoji') {
                // Emoji não pode ser quebrado, força em nova linha se necessário
                if (currentWidth + size > maxWidth && currentTokens.length > 0) {
                    lines.push(tokensToString(currentTokens));
                    currentTokens = [token];
                    currentWidth = size;
                } else {
                    currentTokens.push(token);
                    currentWidth += size;
                }
            } else {
                // Texto pode ser quebrado caractere por caractere
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
                        
                        // Se nada coube, força pelo menos um caractere
                        if (canFit.length === 0 && remainingText.length > 0) {
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

    // Função para converter tokens de volta para string
    const tokensToString = (tokens) => {
        return tokens.map(token => token.content).join('');
    };

    // Split text into lines using improved logic
    const lines = breakIntoLines(text);

    // Helper function to draw mixed text and emojis for a single line
    const drawMixedLine = async (lineText, lineX, lineY) => {
        try {
            const tokens = tokenizeText(lineText);
            let cursorX = lineX;

            for (const token of tokens) {
                if (token.type === 'emoji') {
                    // Process emoji
                    const fullMatch = token.content;
                    let url;
                    let shouldTryLoad = true;
                    let fallbackText = fullMatch;
                    
                    // Check if it's a Discord custom emoji
                    const discordMatch = fullMatch.match(/<a?:(\w+):(\d+)>/);
                    if (discordMatch) {
                        const [, emojiName, emojiId] = discordMatch;
                        const ext = fullMatch.startsWith('<a:') ? 'gif' : 'png';
                        url = `https://cdn.discordapp.com/emojis/${emojiId}.${ext}`;
                        fallbackText = emojiName || fullMatch;
                    } else {
                        // Unicode emoji - convert to codepoints for Twemoji
                        const codepoints = [];
                        for (let i = 0; i < fullMatch.length; i++) {
                            const code = fullMatch.codePointAt(i);
                            if (code) {
                                codepoints.push(code.toString(16));
                                // Skip next character if it's a surrogate pair
                                if (code > 0xFFFF) {
                                    i++;
                                }
                            }
                        }
                        
                        if (codepoints.length > 0) {
                            const codepointStr = codepoints.join('-');
                            url = `https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/${codepointStr}.png`;
                            fallbackText = fullMatch;
                        } else {
                            shouldTryLoad = false;
                        }
                    }

                    if (url && shouldTryLoad) {
                        try {
                            // Check if URL exists before trying to load
                            const urlExists = await checkUrl(url);
                            
                            if (urlExists) {
                                const img = await __1.CanvasUtil.resolveImage(this, ctx, url);
                                if (img instanceof forgescript_1.Return) return img;
                                
                                // Draw emoji aligned with text baseline
                                canvas.ctx.drawImage(
                                    img,
                                    cursorX,
                                    lineY - size + (size * 0.2), // Adjust vertical position for better alignment
                                    size,
                                    size
                                );
                            } else {
                                // URL doesn't exist, render as text fallback
                                if (mode === __1.FillOrStroke.fill) {
                                    canvas.ctx.fillText(fallbackText, cursorX, lineY);
                                } else {
                                    canvas.ctx.strokeText(fallbackText, cursorX, lineY);
                                }
                            }
                            cursorX += size;
                        } catch (error) {
                            // If emoji fails to load, render as text fallback
                            console.warn(`Failed to load emoji: ${url}`, error);
                            if (mode === __1.FillOrStroke.fill) {
                                canvas.ctx.fillText(fallbackText, cursorX, lineY);
                            } else {
                                canvas.ctx.strokeText(fallbackText, cursorX, lineY);
                            }
                            cursorX += canvas.ctx.measureText(fallbackText).width;
                        }
                    } else {
                        // No valid URL, render as text
                        if (mode === __1.FillOrStroke.fill) {
                            canvas.ctx.fillText(fallbackText, cursorX, lineY);
                        } else {
                            canvas.ctx.strokeText(fallbackText, cursorX, lineY);
                        }
                        cursorX += canvas.ctx.measureText(fallbackText).width;
                    }
                } else {
                    // Process text
                    if (mode === __1.FillOrStroke.fill) {
                        canvas.ctx.fillText(token.content, cursorX, lineY);
                    } else {
                        canvas.ctx.strokeText(token.content, cursorX, lineY);
                    }
                    cursorX += canvas.ctx.measureText(token.content).width;
                }
            }
        } catch (error) {
            console.warn('Error in drawMixedLine:', error);
            // Fallback: desenha o texto simples
            if (mode === __1.FillOrStroke.fill) {
                canvas.ctx.fillText(lineText, lineX, lineY);
            } else {
                canvas.ctx.strokeText(lineText, lineX, lineY);
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
