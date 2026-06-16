const express = require('express');
const ffmpegStatic = require('ffmpeg-static');
const { exec } = require('child_process'); // Usamos exec para comandos de terminal directos
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// Inyectamos FFmpeg en el PATH para que el comando de conversión lo encuentre solo
const ffmpegDir = path.dirname(ffmpegStatic);
process.env.PATH = `${ffmpegDir}${path.delimiter}${process.env.PATH}`;

let descargasRecientes = [];

app.use(express.json());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/recientes', (req, res) => {
    res.json(descargasRecientes);
});

// 1. OBTENER INFORMACIÓN DEL VIDEO USANDO NPX
app.post('/analizar', (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'Por favor, proporciona una URL válida.' });

    // Ejecutamos yt-dlp directamente usando npx de forma limpia y segura
    const comando = `npx --yes @shasoft/yt-dlp-package "${url}" -J`;

    exec(comando, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
        if (error) {
            console.error('Error al analizar:', error);
            return res.status(500).json({ error: 'No se pudo obtener información del video.' });
        }

        try {
            const videoInfo = JSON.parse(stdout);
            res.json({
                title: videoInfo.title,
                duration: videoInfo.duration_string || 'Desconocida',
                uploader: videoInfo.uploader || 'Canal Desconocido',
                thumbnail: videoInfo.thumbnail || 'https://via.placeholder.com/480x360?text=Sin+Miniatura',
                url: url
            });
        } catch (parseError) {
            console.error('Error al procesar JSON:', parseError);
            res.status(500).json({ error: 'Error al procesar los datos del video.' });
        }
    });
});

// 2. CONVERTIR VIDEO A MP3 USANDO NPX
app.post('/convertir', (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL requerida.' });

    // Obtenemos primero el título de forma rápida para nombrar el archivo
    const comandoInfo = `npx --yes @shasoft/yt-dlp-package "${url}" --get-title`;

    exec(comandoInfo, (errorTitle, stdoutTitle) => {
        const titulo = errorTitle ? 'audio_descargado' : stdoutTitle.trim();
        const safeTitle = titulo.replace(/[/\\?%*:|"<>]/g, '-');
        const outputFilename = `${safeTitle}.mp3`;
        const outputPath = path.join(__dirname, outputFilename);

        // Comando de conversión directo con npx (sin flags conflictivas de ffmpeg locales)
        const comandoConvertir = `npx --yes @shasoft/yt-dlp-package "${url}" -x --audio-format mp3 --audio-quality 0 -o "${outputPath}"`;

        console.log('Iniciando conversión con npx...');
        exec(comandoConvertir, (error, stdout, stderr) => {
            if (error) {
                console.error('Error en conversión:', error);
                return res.status(500).json({ error: 'Error durante la conversión de audio.' });
            }

            if (fs.existsSync(outputPath)) {
                const nuevaDescarga = {
                    id: Date.now(),
                    title: titulo,
                    uploader: 'YouTube Video',
                    thumbnail: 'https://via.placeholder.com/120?text=MP3'
                };
                
                descargasRecientes.unshift(nuevaDescarga);
                if (descargasRecientes.length > 5) descargasRecientes.pop();

                res.download(outputPath, outputFilename, (err) => {
                    if (err) console.error('Error al enviar archivo:', err);
                    try {
                        fs.unlinkSync(outputPath);
                    } catch (e) {}
                });
            } else {
                res.status(500).json({ error: 'No se pudo encontrar el archivo MP3 generado.' });
            }
        });
    });
});

app.listen(PORT, () => {
    console.log('Servidor levantado con ejecución automatizada NPX.');
});

