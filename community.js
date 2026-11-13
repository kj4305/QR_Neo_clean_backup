(() => {
    const config = window.QR_STUDIO_SUPABASE_CONFIG || {};
    const databaseStatus = document.getElementById('community-db-status');
    const historyStatus = document.getElementById('history-status');
    const reviewForm = document.getElementById('review-form');
    const reviewList = document.getElementById('review-list');
    const questionForm = document.getElementById('question-form');
    const questionList = document.getElementById('question-list');
    const adminLoginForm = document.getElementById('admin-login-form');
    const adminStatus = document.getElementById('admin-status');
    const adminLogoutButton = document.getElementById('admin-logout-btn');
    const historyList = document.getElementById('history-list');
    const saveHistoryButton = document.getElementById('save-history-btn');
    const historyBucket = 'qr-history';

    let client = null;
    let adminClient = null;
    let currentUser = null;
    let adminUser = null;
    let isAdmin = false;

    const setText = (element, message) => {
        if (element) element.textContent = message;
    };

    const setFormStatus = (id, message, isError = false) => {
        const element = document.getElementById(id);
        if (!element) return;
        element.textContent = message;
        element.classList.toggle('is-error', isError);
    };

    const setDatabaseReady = (ready) => {
        document.querySelectorAll(
            '#review-form button[type="submit"], #question-form button[type="submit"], #admin-login-form button[type="submit"]'
        ).forEach(button => { button.disabled = !ready; });
        saveHistoryButton.disabled = !ready;
    };

    const formatDate = (value) => {
        if (!value) return '날짜 정보 없음';
        return new Intl.DateTimeFormat('ko-KR', {
            dateStyle: 'medium',
            timeZone: 'Asia/Seoul'
        }).format(new Date(value));
    };

    const makeElement = (tagName, className, text) => {
        const element = document.createElement(tagName);
        if (className) element.className = className;
        if (text !== undefined) element.textContent = text;
        return element;
    };

    const showEmpty = (container, message) => {
        container.replaceChildren(makeElement('p', 'empty-state', message));
    };

    const isTrustedAdmin = (user) => user?.app_metadata?.role === 'admin';

    const refreshAdminState = () => {
        isAdmin = isTrustedAdmin(adminUser);
        adminLogoutButton.hidden = !isAdmin;
        adminLoginForm.querySelectorAll('input, button[type="submit"], label').forEach(control => {
            control.hidden = isAdmin;
        });
        if (isAdmin) {
            document.getElementById('admin-login-panel').open = true;
            setText(adminStatus, '관리자 답변 모드입니다. 각 질문 아래에서 답변을 등록할 수 있습니다.');
        } else if (currentUser && currentUser.is_anonymous) {
            setText(adminStatus, '관리자 계정으로 로그인하면 질문에 답변할 수 있습니다.');
        }
    };

    async function ensureUser() {
        if (currentUser) return currentUser;
        const { data: sessionData, error: sessionError } = await client.auth.getSession();
        if (sessionError) throw sessionError;
        if (sessionData.session?.user) {
            currentUser = sessionData.session.user;
            refreshAdminState();
            return currentUser;
        }

        const { data, error } = await client.auth.signInAnonymously();
        if (error) throw error;
        currentUser = data.user;
        refreshAdminState();
        return currentUser;
    }

    function renderReviews(reviews) {
        if (!reviews?.length) {
            showEmpty(reviewList, '아직 등록된 후기가 없습니다. 첫 후기를 남겨주세요.');
            return;
        }

        const fragment = document.createDocumentFragment();
        reviews.forEach(review => {
            const card = makeElement('article', 'community-item review-item');
            const header = makeElement('div', 'community-item-header');
            const byline = makeElement('div', 'community-byline');
            byline.append(
                makeElement('strong', 'community-author', review.author_name),
                makeElement('time', 'community-date', formatDate(review.created_at))
            );
            const stars = makeElement('span', 'review-stars', `${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}`);
            stars.setAttribute('aria-label', `${review.rating}점 / 5점`);
            header.append(byline, stars);
            card.append(header, makeElement('p', 'community-body', review.content));
            fragment.append(card);
        });
        reviewList.replaceChildren(fragment);
    }

    function addAnswerEditor(card, question) {
        const editor = makeElement('div', 'admin-answer-editor');
        const label = makeElement('label', '', '관리자 답변');
        const textarea = document.createElement('textarea');
        textarea.rows = 4;
        textarea.maxLength = 4000;
        textarea.required = true;
        textarea.value = question.answer || '';
        textarea.placeholder = '질문에 대한 답변을 작성하세요.';
        label.append(textarea);

        const button = makeElement('button', 'community-secondary-btn', question.answer ? '답변 수정' : '답변 등록');
        button.type = 'button';
        const status = makeElement('p', 'form-status', '');
        status.setAttribute('role', 'status');
        button.addEventListener('click', async () => {
            const answer = textarea.value.trim();
            if (!answer) {
                setText(status, '답변 내용을 입력해주세요.');
                return;
            }
            button.disabled = true;
            setText(status, '답변을 저장하고 있습니다.');
            const { error } = await adminClient.from('questions')
                .update({ answer, answered_at: new Date().toISOString() })
                .eq('id', question.id);
            button.disabled = false;
            if (error) {
                setText(status, '답변을 저장하지 못했습니다. 관리자 권한과 데이터베이스 설정을 확인해주세요.');
                status.classList.add('is-error');
                return;
            }
            setText(status, '답변을 저장했습니다.');
            status.classList.remove('is-error');
            await loadQuestions();
        });

        editor.append(label, button, status);
        card.append(editor);
    }

    function renderQuestions(questions) {
        if (!questions?.length) {
            showEmpty(questionList, '아직 등록된 질문이 없습니다. 궁금한 점을 남겨주세요.');
            return;
        }

        const fragment = document.createDocumentFragment();
        questions.forEach(question => {
            const card = makeElement('article', 'community-item question-item');
            const header = makeElement('div', 'community-item-header');
            const byline = makeElement('div', 'community-byline');
            byline.append(
                makeElement('strong', 'community-author', question.author_name),
                makeElement('time', 'community-date', formatDate(question.created_at))
            );
            header.append(byline, makeElement('span', `answer-state ${question.answer ? 'is-answered' : ''}`, question.answer ? '답변 완료' : '답변 대기'));
            card.append(header, makeElement('h3', 'question-title', question.title), makeElement('p', 'community-body', question.body));

            if (question.answer) {
                const answer = makeElement('div', 'answer-card');
                answer.append(
                    makeElement('strong', 'answer-label', '다이루케어 재가복지센터 답변'),
                    makeElement('time', 'community-date', formatDate(question.answered_at)),
                    makeElement('p', 'community-body', question.answer)
                );
                card.append(answer);
            }

            if (isAdmin) addAnswerEditor(card, question);
            fragment.append(card);
        });
        questionList.replaceChildren(fragment);
    }

    async function loadReviews() {
        const { data, error } = await client.from('reviews')
            .select('id, author_name, rating, content, created_at')
            .order('created_at', { ascending: false })
            .limit(50);
        if (error) {
            showEmpty(reviewList, '후기를 불러오지 못했습니다. 데이터베이스 설정을 확인해주세요.');
            return;
        }
        renderReviews(data);
    }

    async function loadQuestions() {
        const { data, error } = await client.from('questions')
            .select('id, author_name, title, body, answer, answered_at, created_at')
            .order('created_at', { ascending: false })
            .limit(50);
        if (error) {
            showEmpty(questionList, '질문과 답변을 불러오지 못했습니다. 데이터베이스 설정을 확인해주세요.');
            return;
        }
        renderQuestions(data);
    }

    async function downloadQrImage(path, filename) {
        const { data, error } = await client.storage.from(historyBucket).download(path);
        if (error) throw error;
        const blobUrl = URL.createObjectURL(data);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        document.body.append(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    }

    async function loadHistory() {
        if (!currentUser) {
            showEmpty(historyList, 'QR 이력을 보려면 데이터베이스 연결이 필요합니다.');
            return;
        }

        const { data, error } = await client.from('qr_history')
            .select('id, qr_data, qr_options, image_path, created_at')
            .order('created_at', { ascending: false })
            .limit(30);
        if (error) {
            showEmpty(historyList, 'QR 기록을 불러오지 못했습니다. 데이터베이스 설정을 확인해주세요.');
            return;
        }
        if (!data.length) {
            showEmpty(historyList, '저장된 QR 기록이 없습니다. 생성 화면에서 “현재 QR 기록 저장”을 눌러보세요.');
            return;
        }

        const fragment = document.createDocumentFragment();
        for (const record of data) {
            const card = makeElement('article', 'history-item');
            const imageFrame = makeElement('div', 'history-image-frame');
            const image = document.createElement('img');
            image.alt = '저장된 QR 코드';
            image.loading = 'lazy';
            const { data: signedData } = await client.storage.from(historyBucket).createSignedUrl(record.image_path, 900);
            if (signedData?.signedUrl) image.src = signedData.signedUrl;
            imageFrame.append(image);

            const info = makeElement('div', 'history-info');
            info.append(
                makeElement('time', 'community-date', formatDate(record.created_at)),
                makeElement('p', 'history-data', record.qr_data),
                makeElement('p', 'history-options', `${record.qr_options?.dotsStyle || 'dots'} · ${record.qr_options?.dotsColor || '#000000'}`)
            );
            const downloadButton = makeElement('button', 'community-secondary-btn', 'QR 다운로드');
            downloadButton.type = 'button';
            downloadButton.addEventListener('click', async () => {
                downloadButton.disabled = true;
                try {
                    await downloadQrImage(record.image_path, `qr-${record.id}.png`);
                } catch (error) {
                    setText(historyStatus, 'QR 이미지를 내려받지 못했습니다. 다시 로그인한 뒤 시도해주세요.');
                } finally {
                    downloadButton.disabled = false;
                }
            });
            info.append(downloadButton);
            card.append(imageFrame, info);
            fragment.append(card);
        }
        historyList.replaceChildren(fragment);
    }

    async function refreshCommunity() {
        await Promise.all([loadReviews(), loadQuestions(), loadHistory()]);
        refreshAdminState();
    }

    async function saveCurrentQr() {
        if (!window.qrStudio) throw new Error('QR 생성 기능을 불러오지 못했습니다. 페이지를 새로고침해주세요.');
        const user = await ensureUser();
        const snapshot = window.qrStudio.getSnapshot();
        if (!snapshot.data.trim()) throw new Error('먼저 URL 또는 문장을 입력해주세요.');

        const qrImage = await window.qrStudio.getPng();
        const recordId = crypto.randomUUID();
        const imagePath = `${user.id}/${recordId}.png`;
        const upload = await client.storage.from(historyBucket).upload(imagePath, qrImage, {
            contentType: 'image/png',
            upsert: false
        });
        if (upload.error) throw upload.error;

        const insert = await client.from('qr_history').insert({
            id: recordId,
            user_id: user.id,
            qr_data: snapshot.data,
            qr_options: snapshot.options,
            image_path: imagePath
        });
        if (insert.error) {
            await client.storage.from(historyBucket).remove([imagePath]);
            throw insert.error;
        }
        await loadHistory();
    }

    function handleRatingDisplay() {
        const selected = Number(reviewForm.querySelector('input[name="rating"]:checked')?.value || 5);
        reviewForm.querySelectorAll('.rating-options label').forEach((label, index) => {
            label.classList.toggle('is-selected', index < selected);
        });
    }

    reviewForm.querySelectorAll('input[name="rating"]').forEach(input => {
        input.addEventListener('change', handleRatingDisplay);
    });
    handleRatingDisplay();

    reviewForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const submit = reviewForm.querySelector('button[type="submit"]');
        const formData = new FormData(reviewForm);
        const authorName = String(formData.get('author_name') || '').trim();
        const content = String(formData.get('content') || '').trim();
        const rating = Number(formData.get('rating'));
        if (!authorName || !content || rating < 1 || rating > 5) return;

        submit.disabled = true;
        setFormStatus('review-status', '후기를 등록하고 있습니다.');
        try {
            const user = await ensureUser();
            const { error } = await client.from('reviews').insert({
                author_id: user.id,
                author_name: authorName,
                rating,
                content
            });
            if (error) throw error;
            reviewForm.reset();
            reviewForm.querySelector('input[name="rating"][value="5"]').checked = true;
            handleRatingDisplay();
            setFormStatus('review-status', '후기를 등록했습니다.');
            await loadReviews();
        } catch (error) {
            setFormStatus('review-status', '후기를 저장하지 못했습니다. 데이터베이스 연결과 SQL 설정을 확인해주세요.', true);
        } finally {
            submit.disabled = false;
        }
    });

    questionForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const submit = questionForm.querySelector('button[type="submit"]');
        const formData = new FormData(questionForm);
        const authorName = String(formData.get('author_name') || '').trim();
        const title = String(formData.get('title') || '').trim();
        const body = String(formData.get('body') || '').trim();
        if (!authorName || !title || !body) return;

        submit.disabled = true;
        setFormStatus('question-status', '질문을 등록하고 있습니다.');
        try {
            const user = await ensureUser();
            const { error } = await client.from('questions').insert({
                author_id: user.id,
                author_name: authorName,
                title,
                body
            });
            if (error) throw error;
            questionForm.reset();
            setFormStatus('question-status', '질문을 등록했습니다.');
            await loadQuestions();
        } catch (error) {
            setFormStatus('question-status', '질문을 저장하지 못했습니다. 데이터베이스 연결과 SQL 설정을 확인해주세요.', true);
        } finally {
            submit.disabled = false;
        }
    });

    saveHistoryButton.addEventListener('click', async () => {
        saveHistoryButton.disabled = true;
        setText(historyStatus, '현재 QR 이미지와 생성 정보를 저장하고 있습니다.');
        try {
            await saveCurrentQr();
            setText(historyStatus, '내 QR 기록에 저장했습니다.');
        } catch (error) {
            setText(historyStatus, '저장하지 못했습니다. 데이터베이스와 Storage 설정을 확인해주세요.');
        } finally {
            saveHistoryButton.disabled = false;
        }
    });

    adminLoginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const submit = adminLoginForm.querySelector('button[type="submit"]');
        submit.disabled = true;
        setFormStatus('admin-status', '로그인하고 있습니다.');
        const email = document.getElementById('admin-email').value.trim();
        const password = document.getElementById('admin-password').value;
        const { data, error } = await adminClient.auth.signInWithPassword({ email, password });
        submit.disabled = false;
        if (error) {
            setFormStatus('admin-status', '로그인하지 못했습니다. 이메일과 비밀번호를 확인해주세요.', true);
            return;
        }
        adminUser = data.user;
        refreshAdminState();
        if (!isAdmin) {
            setFormStatus('admin-status', '로그인 계정에 관리자 답변 권한이 없습니다.', true);
            return;
        }
        setFormStatus('admin-status', '관리자로 로그인했습니다.');
        await loadQuestions();
    });

    adminLogoutButton.addEventListener('click', async () => {
        adminLogoutButton.disabled = true;
        await adminClient.auth.signOut();
        adminUser = null;
        setText(adminStatus, '관리자 로그아웃이 완료되었습니다.');
        refreshAdminState();
        await loadQuestions();
        adminLogoutButton.disabled = false;
    });

    const readyConfig = typeof config.url === 'string'
        && config.url.startsWith('https://')
        && typeof config.publishableKey === 'string'
        && config.publishableKey.startsWith('sb_publishable_');

    if (!readyConfig || !window.supabase?.createClient) {
        setDatabaseReady(false);
        setText(databaseStatus, '공용 데이터 저장소가 아직 연결되지 않았습니다. Supabase 프로젝트 URL과 공개 Publishable key 설정이 필요합니다.');
        return;
    }

    client = window.supabase.createClient(config.url, config.publishableKey);
    adminClient = window.supabase.createClient(config.url, config.publishableKey, {
        auth: { storageKey: 'qr-studio-admin-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
    setDatabaseReady(false);
    setText(databaseStatus, '공용 저장소에 연결하고 있습니다.');

    (async () => {
        try {
            const { data: sessionData, error: sessionError } = await client.auth.getSession();
            if (sessionError) throw sessionError;
            if (sessionData.session?.user) {
                currentUser = sessionData.session.user;
            } else {
                const { data, error } = await client.auth.signInAnonymously();
                if (error) throw error;
                currentUser = data.user;
            }

            const { data: adminSessionData, error: adminSessionError } = await adminClient.auth.getSession();
            if (adminSessionError) throw adminSessionError;
            adminUser = isTrustedAdmin(adminSessionData.session?.user) ? adminSessionData.session.user : null;
            if (adminSessionData.session?.user && !adminUser) await adminClient.auth.signOut();

            refreshAdminState();
            setDatabaseReady(true);
            setText(databaseStatus, 'Supabase에 연결되었습니다. 사용 후기와 질문은 모두에게 표시되고, QR 이력은 현재 사용자에게만 보입니다.');
            setText(historyStatus, 'QR 이력은 현재 브라우저의 익명 계정에 저장됩니다. 브라우저 데이터를 지우면 다시 찾을 수 없습니다.');
            await refreshCommunity();

            client.auth.onAuthStateChange((event, session) => {
                currentUser = session?.user || null;
                refreshAdminState();
                if (event !== 'INITIAL_SESSION') {
                    window.setTimeout(() => refreshCommunity(), 0);
                }
            });
            adminClient.auth.onAuthStateChange((event, session) => {
                adminUser = isTrustedAdmin(session?.user) ? session.user : null;
                refreshAdminState();
                if (event !== 'INITIAL_SESSION') window.setTimeout(() => loadQuestions(), 0);
            });
        } catch (error) {
            setDatabaseReady(false);
            setText(databaseStatus, '데이터베이스 연결을 시작하지 못했습니다. Supabase SQL과 익명 로그인 설정을 확인해주세요.');
            setText(historyStatus, 'QR 기록을 저장할 수 없습니다.');
        }
    })();
})();
