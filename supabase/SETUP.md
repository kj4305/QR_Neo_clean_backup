# Supabase 연결 안내

QR Studio는 현재 Vercel 정적 사이트입니다. 공용 후기와 Q&A, 사용자별 QR 이력을 저장하기 위해 Supabase의 Postgres, Auth, 비공개 Storage를 사용합니다. Supabase JavaScript 클라이언트는 CDN으로 불러오므로 npm 패키지 설치는 필요하지 않습니다.

## 프로젝트 연결

1. Supabase에서 프로젝트를 생성합니다.
2. Supabase SQL Editor에서 `schema.sql` 전체를 실행합니다.
3. Authentication 설정에서 Anonymous Sign-Ins를 활성화합니다. QR 이력은 현재 브라우저의 익명 계정에 저장되고, RLS로 다른 사용자의 이력과 이미지가 차단됩니다.
4. 프로젝트의 Project URL과 Publishable key를 확인해 루트의 `supabase-config.js`에 입력합니다.

```js
window.QR_STUDIO_SUPABASE_CONFIG = {
    url: "https://YOUR_PROJECT_REF.supabase.co",
    publishableKey: "sb_publishable_..."
};
```

Publishable key는 브라우저에 배포되는 공개 키입니다. 데이터 보호는 SQL에 설정된 RLS 정책이 담당합니다. Secret key 또는 `service_role` 키는 이 파일이나 브라우저 코드에 넣지 마세요.

## 관리자 답변 계정

1. Supabase Authentication에서 관리자가 사용할 이메일/비밀번호 사용자를 만듭니다.
2. SQL Editor에서 아래 쿼리의 이메일을 해당 계정으로 바꾸어 실행합니다.

```sql
update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || '{"role":"admin"}'::jsonb
where lower(email) = lower('admin@example.com');
```

3. 관리자 계정으로 다시 로그인하고 QR Studio의 **관리자 답변 로그인**을 사용합니다. 답변 권한은 사용자가 직접 수정할 수 없는 `app_metadata`와 RLS 정책으로 확인합니다.

## 이력 보관 범위

후기와 질문·답변은 모든 방문자가 읽을 수 있도록 데이터베이스에 저장됩니다. QR 이력의 URL/문장과 PNG는 소유자의 Supabase 익명 계정만 읽을 수 있으며, 이미지 저장소도 비공개입니다. 익명 계정은 현재 브라우저에 연결되므로 브라우저 데이터를 지우거나 다른 기기를 사용하면 이전 이력을 복구할 수 없습니다. 여러 기기에서 이력을 이어 보려면 Supabase Auth에 이메일 로그인/계정 연동을 추가해야 합니다.

프로젝트 URL과 Publishable key를 설정하기 전에는 후기·질문 등록과 QR 이력 저장이 비활성화되며, QR 생성 기능은 계속 사용할 수 있습니다.
