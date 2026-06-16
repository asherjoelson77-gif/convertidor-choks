const express = require('express');
const YTDlpWrap = require('yt-dlp-wrap').default;
const ffmpegStatic = require('ffmpeg-static');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const ytDlpPath = path.join(__dirname, 'yt-dlp');
let ytDlpWrap;

// Función para descargar yt-dlp y darle permisos de ejecución obligatorios
async function inicializarYtDlp() {
    if (!fs.existsSync(ytDlpPath)) {
        console.log('Descargando versión oficial de yt-dlp desde GitHub...');
        try {
            await YTDlpWrap.downloadFromGithub(ytDlpPath, 'yt-dlp/yt-dlp');
            console.log('yt-dlp oficial descargado con éxito.');
            
            // LÍNEA CLAVE: Le otorgamos permisos de ejecución (rwxr-xr-x) para que Render no lo bloquee
            fs.chmodSync(ytDlpPath, '755');
            console.log('Permisos de ejecución otorgados a yt-dlp.');
        } catch (err) {
            console.error('Error descargando yt-dlp:', err);
        }
    } else {
        // Por si acaso ya existe pero no tiene permisos, se los aseguramos
        try {
            fs.chmodSync(ytDlpPath, '755');
        } catch (e) {}
    }
    ytDlpWrap = new YTDlpWrap(ytDlpPath);
}

// Inicializar el ejecutable antes de arrancar por completo
inicializarYtDlp();

let descargasRecientes = [];

app.use(express.json());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/recientes', (req, res) => {
    res.json(descargasRecientes);
});

app.post('/analizar', async (req, res) => {
    const { url } = req.body;
    if (!url) {
        return res.status(400).json({ error: 'Por favor, proporciona una URL válida.' });
    }

    try {
        if (!ytDlpWrap) await inicializarYtDlp();
        const videoInfo = await ytDlpWrap.getVideoInfo(url);
        res.json({
            title: videoInfo.title,
            duration: videoInfo.duration_string || 'Desconocida',
            uploader: videoInfo.uploader || 'Canal Desconocido',
            thumbnail: videoInfo.thumbnail || 'https://via.placeholder.com/480x360?text=Sin+Miniatura',
            url: url
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'No se pudo obtener información del video. Verifica el enlace.' });
    }
});

app.post('/convertir', async (req, res) => {
    const { url } = req.body;

    try {
        if (!ytDlpWrap) await inicializarYtDlp();
        const videoInfo = await ytDlpWrap.getVideoInfo(url);
        const safeTitle = videoInfo.title.replace(/[/\\?%*:|"<>]/g, '-');
        const outputFilename = `${safeTitle}.mp3`;
        const outputPath = path.join(__dirname, outputFilename);

        await ytDlpWrap.execPromise([
            url,
            '-x',
            '--audio-format', 'mp3',
            '--audio-quality', '0',
            '--ffmpeg-location', ffmpegStatic,
            '-o', outputPath
        ]);

        if (fs.existsSync(outputPath)) {
            const nuevaDescarga = {
                id: Date.now(),
                title: videoInfo.title,
                uploader: videoInfo.uploader || 'Canal Desconocido',
                thumbnail: videoInfo.thumbnail || 'https://via.placeholder.com/120?text=MP3'
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
            res.status(500).json({ error: 'No se pudo generar el archivo MP3.' });
        }

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error durante la conversión.' });
    }
});

app.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});

