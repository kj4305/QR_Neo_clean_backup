document.addEventListener('DOMContentLoaded', () => {
    const qrText = document.getElementById('qr-text');
    const dotsColor = document.getElementById('dots-color');
    const bgColor = document.getElementById('bg-color');
    const dotsStyle = document.getElementById('dots-style');
    const cornersStyle = document.getElementById('corners-style');
    const exportFormat = document.getElementById('export-format');
    const downloadBtn = document.getElementById('download-btn');
    const shortenBtn = document.getElementById('shorten-btn');
    const logoUpload = document.getElementById('logo-upload');
    const removeLogoBtn = document.getElementById('remove-logo-btn');
    const canvasContainer = document.getElementById('canvas-container');

    let currentLogo = "";

    // Initialize QR Code Styling
    const qrCode = new QRCodeStyling({
        width: 300,
        height: 300,
        type: "svg",
        data: qrText.value,
        image: "",
        dotsOptions: {
            color: dotsColor.value,
            type: dotsStyle.value
        },
        backgroundOptions: {
            color: bgColor.value,
        },
        cornersSquareOptions: {
            type: cornersStyle.value,
            color: dotsColor.value
        },
        imageOptions: {
            crossOrigin: "anonymous",
            margin: 5,
            imageSize: 0.4
        }
    });

    // Initial Render
    qrCode.append(canvasContainer);

    // Update Function
    const updateQR = () => {
        qrCode.update({
            data: qrText.value || " ",
            image: currentLogo,
            dotsOptions: {
                color: dotsColor.value,
                type: dotsStyle.value
            },
            backgroundOptions: {
                color: bgColor.value,
            },
            cornersSquareOptions: {
                type: cornersStyle.value,
                color: dotsColor.value
            }
        });
    };

    // Keep the community/history features separate from the QR generator internals.
    window.qrStudio = {
        getSnapshot: () => ({
            data: qrText.value,
            options: {
                dotsColor: dotsColor.value,
                backgroundColor: bgColor.value,
                dotsStyle: dotsStyle.value,
                cornersStyle: cornersStyle.value,
                hasLogo: Boolean(currentLogo)
            }
        }),
        getPng: () => qrCode.getRawData('png')
    };

    // Event Listeners for customization
    [qrText, dotsColor, bgColor, dotsStyle, cornersStyle].forEach(el => {
        el.addEventListener('input', updateQR);
    });

    // URL Shortening Logic (TinyURL)
    const shortUrlResult = document.getElementById('short-url-result');
    const shortUrlOutput = document.getElementById('short-url-output');
    const copyBtn = document.getElementById('copy-btn');

    shortenBtn.addEventListener('click', async () => {
        const url = qrText.value;
        if (!url || !url.startsWith('http')) {
            alert('단축할 수 있는 올바른 URL을 입력해주세요.');
            return;
        }

        shortenBtn.disabled = true;
        shortenBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>...';

        try {
            // TinyURL API - always redirects directly without interstitial pages
            const response = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`);
            const shortUrl = await response.text();

            if (shortUrl && shortUrl.startsWith('http')) {
                const trimmed = shortUrl.trim();
                // Show the shortened URL in the result box
                shortUrlOutput.value = trimmed;
                shortUrlResult.style.display = 'flex';
                // Update QR code to use the shortened URL
                qrCode.update({
                    data: trimmed,
                    image: currentLogo,
                    dotsOptions: { color: dotsColor.value, type: dotsStyle.value },
                    backgroundOptions: { color: bgColor.value },
                    cornersSquareOptions: { type: cornersStyle.value, color: dotsColor.value }
                });
            } else {
                alert('URL 단축에 실패했습니다.');
            }
        } catch (error) {
            console.error('Error shortening URL:', error);
            alert('네트워크 오류가 발생했습니다.');
        } finally {
            shortenBtn.disabled = false;
            shortenBtn.innerHTML = '<i class="fa-solid fa-scissors"></i> URL 단축';
        }
    });

    // Copy shortened URL to clipboard
    copyBtn.addEventListener('click', () => {
        const text = shortUrlOutput.value;
        if (!text) return;
        navigator.clipboard.writeText(text).then(() => {
            copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> 복사됨!';
            copyBtn.classList.add('copied');
            setTimeout(() => {
                copyBtn.innerHTML = '<i class="fa-solid fa-copy"></i> 복사';
                copyBtn.classList.remove('copied');
            }, 2000);
        });
    });

    // Logo Upload Handling
    logoUpload.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                currentLogo = event.target.result;
                updateQR();
            };
            reader.readAsDataURL(file);
        }
    });

    // Remove Logo Logic
    removeLogoBtn.addEventListener('click', () => {
        currentLogo = "";
        logoUpload.value = "";
        updateQR();
    });

    // Download Functionality
    downloadBtn.addEventListener('click', () => {
        const format = exportFormat.value;
        qrCode.download({
            name: "qr-code",
            extension: format
        });
    });

    // Export a branded poster while keeping the generated QR modules untouched.
    const posterDownloadBtn = document.getElementById('poster-download-btn');
    const loadImage = (src) => new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = src;
    });

    posterDownloadBtn.addEventListener('click', async () => {
        const qrSvg = canvasContainer.querySelector('svg');
        if (!qrSvg) {
            alert('QR 코드를 먼저 생성해주세요.');
            return;
        }

        posterDownloadBtn.disabled = true;
        posterDownloadBtn.textContent = '포스터 만드는 중...';

        let qrObjectUrl = '';
        try {
            const svgBlob = new Blob([new XMLSerializer().serializeToString(qrSvg)], {
                type: 'image/svg+xml;charset=utf-8'
            });
            qrObjectUrl = URL.createObjectURL(svgBlob);
            const [backgroundImage, qrImage] = await Promise.all([
                loadImage('qr-care-bg.png'),
                loadImage(qrObjectUrl)
            ]);

            const canvas = document.createElement('canvas');
            canvas.width = 900;
            canvas.height = 1350;
            const context = canvas.getContext('2d');
            context.drawImage(backgroundImage, 0, 0, canvas.width, canvas.height);

            const drawPill = (x, y, width, height, color) => {
                context.fillStyle = color;
                context.beginPath();
                context.roundRect(x, y, width, height, height / 2);
                context.fill();
            };

            drawPill(195, 92, 510, 72, 'rgba(255,255,255,0.86)');
            context.fillStyle = '#32664f';
            context.font = '800 30px "Malgun Gothic", sans-serif';
            context.textAlign = 'center';
            context.textBaseline = 'middle';
            context.fillText('다이루케어재가복지센터', 450, 128);

            context.fillStyle = '#214d3c';
            context.font = '800 64px "Malgun Gothic", sans-serif';
            context.fillText('카카오톡으로', 450, 272);
            context.fillText('편하게 상담하세요', 450, 352);
            context.fillStyle = '#527363';
            context.font = '500 30px "Malgun Gothic", sans-serif';
            context.fillText('QR을 찍고 카카오톡으로 문의하세요', 450, 420);

            context.save();
            context.shadowColor = 'rgba(31,73,56,0.20)';
            context.shadowBlur = 28;
            context.shadowOffsetY = 12;
            context.fillStyle = '#ffffff';
            context.beginPath();
            context.roundRect(140, 485, 620, 620, 42);
            context.fill();
            context.restore();
            context.drawImage(qrImage, 200, 545, 500, 500);

            drawPill(265, 1170, 370, 70, '#214d3c');
            context.fillStyle = '#ffffff';
            context.font = '700 28px "Malgun Gothic", sans-serif';
            context.fillText('KakaoTalk · 1:1 상담', 450, 1206);

            const pngBlob = await new Promise((resolve, reject) => {
                canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG 변환 실패')), 'image/png');
            });
            const posterUrl = URL.createObjectURL(pngBlob);
            const link = document.createElement('a');
            link.href = posterUrl;
            link.download = '다이루케어재가복지센터-카카오톡상담.png';
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(posterUrl), 1000);
        } catch (error) {
            console.error('Poster export failed:', error);
            alert('포스터 저장에 실패했습니다. 잠시 후 다시 시도해주세요.');
        } finally {
            if (qrObjectUrl) URL.revokeObjectURL(qrObjectUrl);
            posterDownloadBtn.disabled = false;
            posterDownloadBtn.textContent = '포스터 PNG 저장';
        }
    });
});
