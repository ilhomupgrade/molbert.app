# Prompt для Bolt.new: AI Image Generator SaaS

## 🎯 Описание

Создай production-ready SaaS платформу для генерации и редактирования изображений с AI. Современный, минималистичный дизайн с темной темой.

---

## 📦 Технический Стек

**Backend:**
- FastAPI (Python 3.11+)
- PostgreSQL + SQLAlchemy (async)
- Redis (cache + rate limiting)
- Celery (background tasks)
- JWT authentication
- Stripe payments

**Frontend:**
- Vue 3 + TypeScript
- Vite
- Pinia (state)
- TailwindCSS 4
- Headless UI
- Axios

**Infrastructure:**
- Docker + Docker Compose
- Nginx
- AWS S3 (storage)
- Fal.ai (AI generation)

---

## 🗂️ Структура Проекта

```
/
├── backend/
│   ├── app/
│   │   ├── api/v1/          # Endpoints
│   │   ├── core/            # Config, security
│   │   ├── db/              # Models, repos
│   │   ├── schemas/         # Pydantic
│   │   └── services/        # Business logic
│   ├── alembic/             # Migrations
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── stores/
│   │   ├── services/
│   │   └── composables/
│   ├── package.json
│   └── Dockerfile
└── docker-compose.yml
```

---

## 💾 Database Schema

### users
```sql
id, email, username, password_hash, subscription_tier (free/basic/pro),
credits_balance, created_at
```

### images
```sql
id, user_id, prompt, mode (text-to-image/image-to-image),
url, s3_key, aspect_ratio, metadata, created_at
```

### subscriptions
```sql
id, user_id, tier, status, stripe_subscription_id,
current_period_end
```

---

## 🔌 Ключевые API Endpoints

```
Auth:
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh

Users:
GET /api/v1/users/me
PATCH /api/v1/users/me

Images:
POST /api/v1/images/generate      # Главный endpoint
GET /api/v1/images                # List с пагинацией
DELETE /api/v1/images/:id

Subscriptions:
GET /api/v1/subscriptions/plans
POST /api/v1/subscriptions/checkout
```

---

## 🎨 Frontend Страницы

### 1. Landing Page (`/`)
- Hero с примерами AI изображений
- Features grid (3 колонки)
- Pricing таблица (Free, Pro $9.99, Enterprise)
- CTA кнопка "Start Creating"

### 2. Generator (`/generate`) - ГЛАВНАЯ СТРАНИЦА
Layout: 2 колонки (input слева, result справа)

**Левая колонка:**
```vue
<PromptInput
  placeholder="Describe your image..."
  v-model="prompt"
  @keydown.meta.enter="generate"
/>

<ModeToggle v-model="mode">
  <!-- Text-to-Image / Image-to-Image -->
</ModeToggle>

<ImageUploader v-if="mode === 'image-to-image'">
  <!-- Drag & drop + paste support -->
  <!-- Max 2 images -->
</ImageUploader>

<AspectRatioSelector v-model="ratio">
  <!-- 1:1, 16:9, 9:16, 21:9 -->
</AspectRatioSelector>

<GenerateButton
  :loading="isGenerating"
  :disabled="!canGenerate || credits === 0"
>
  Generate (1 credit)
</GenerateButton>

<CreditsDisplay :balance="credits" />
```

**Правая колонка:**
```vue
<ResultDisplay v-if="result">
  <img :src="result.url" @click="openFullscreen" />
  <ActionButtons>
    <Button @click="download">Download</Button>
    <Button @click="copy">Copy</Button>
    <Button @click="saveToGallery">Save</Button>
    <Button @click="useAsInput">Edit</Button>
  </ActionButtons>
  <PromptDisplay>{{ result.prompt }}</PromptDisplay>
</ResultDisplay>

<LoadingState v-else-if="isGenerating">
  <ProgressBar :value="progress" />
  <p>Generating... {{ progress }}%</p>
</LoadingState>

<EmptyState v-else>
  Ready to generate
</EmptyState>
```

### 3. Gallery (`/gallery`)
- Masonry grid изображений
- Filters: All, Public, Private
- Search по промптам
- Hover: показать actions (delete, download)

### 4. Profile (`/profile`)
- User info
- Usage stats (графики)
- Subscription management
- Credits balance + buy button

---

## 🎨 Дизайн Система

**Colors:**
```css
--primary: #614B00      /* Golden brown */
--bg: #000000           /* Black */
--surface: #1a1a1a      /* Dark gray */
--border: rgba(255,255,255,0.1)
--text: #ffffff
--text-secondary: #9ca3af
```

**UI Components:**
- Glass morphism cards: `backdrop-blur-sm bg-black/50`
- Rounded corners: `rounded-xl`
- Shadows: `shadow-2xl`
- Animations: `transition-all duration-300`
- Buttons: Primary (white bg), Secondary (outline)

**Layout:**
- Max width: `max-w-7xl mx-auto`
- Padding: `px-4 md:px-8`
- Gap: `gap-6 md:gap-12`

---

## 🔐 Security Implementation

### 1. Authentication
```python
# backend/app/core/security.py
from passlib.context import CryptContext
from jose import jwt

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm="HS256")
```

### 2. Rate Limiting
```python
# backend/app/core/rate_limit.py
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

@app.post("/api/v1/images/generate")
@limiter.limit("10/day", key_func=get_user_id)  # Free tier
async def generate_image():
    pass
```

### 3. Input Validation
```python
# backend/app/schemas/image.py
from pydantic import BaseModel, validator

class ImageGenerateRequest(BaseModel):
    prompt: str
    mode: Literal["text-to-image", "image-to-image"]
    aspect_ratio: Literal["1:1", "16:9", "9:16", "21:9"]

    @validator("prompt")
    def validate_prompt(cls, v):
        if len(v) > 1000:
            raise ValueError("Prompt too long")
        return v.strip()
```

---

## ⚡ Core Services Implementation

### Image Generation Service
```python
# backend/app/services/ai_service.py
import fal_client

class AIService:
    async def generate_image(
        self,
        prompt: str,
        mode: str,
        aspect_ratio: str,
        image_urls: list[str] = None
    ) -> dict:
        if mode == "text-to-image":
            result = await fal_client.subscribe(
                "fal-ai/nano-banana",
                {
                    "prompt": prompt,
                    "aspect_ratio": aspect_ratio,
                    "output_format": "png"
                }
            )
        else:
            result = await fal_client.subscribe(
                "fal-ai/nano-banana/edit",
                {
                    "prompt": prompt,
                    "image_urls": image_urls,
                    "aspect_ratio": aspect_ratio
                }
            )

        return result.data
```

### Storage Service
```python
# backend/app/services/storage_service.py
import boto3
from uuid import uuid4

class StorageService:
    def __init__(self):
        self.s3 = boto3.client('s3')
        self.bucket = 'imageai-storage'

    async def upload_image(self, image_data: bytes, user_id: str) -> str:
        key = f"images/{user_id}/{uuid4()}.png"
        self.s3.put_object(
            Bucket=self.bucket,
            Key=key,
            Body=image_data,
            ContentType='image/png'
        )
        return f"https://cdn.example.com/{key}"
```

### Credits Service
```python
# backend/app/services/credits_service.py
class CreditsService:
    async def deduct_credits(self, user_id: str, amount: int):
        user = await get_user(user_id)
        if user.credits_balance < amount:
            raise InsufficientCreditsError()

        user.credits_balance -= amount
        await db.commit()

        # Log transaction
        await create_transaction(user_id, -amount, "image_generation")
```

---

## 🎯 Frontend Composables

### useImageGenerator
```typescript
// frontend/src/composables/useImageGenerator.ts
export function useImageGenerator() {
  const prompt = ref('')
  const mode = ref('text-to-image')
  const isGenerating = ref(false)
  const result = ref(null)
  const progress = ref(0)

  const generate = async () => {
    isGenerating.value = true
    progress.value = 0

    const interval = setInterval(() => {
      progress.value = Math.min(progress.value + 5, 95)
    }, 500)

    try {
      const response = await api.post('/images/generate', {
        prompt: prompt.value,
        mode: mode.value,
        aspect_ratio: aspectRatio.value
      })

      result.value = response.data
      progress.value = 100
    } catch (error) {
      handleError(error)
    } finally {
      clearInterval(interval)
      isGenerating.value = false
    }
  }

  return { prompt, mode, result, isGenerating, progress, generate }
}
```

### useImageUpload
```typescript
// frontend/src/composables/useImageUpload.ts
export function useImageUpload() {
  const images = ref([])

  const handleDrop = (e: DragEvent) => {
    const files = Array.from(e.dataTransfer.files)
    files.forEach(file => {
      if (file.type.startsWith('image/')) {
        addImage(file)
      }
    })
  }

  const handlePaste = (e: ClipboardEvent) => {
    const items = e.clipboardData.items
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        addImage(file)
      }
    }
  }

  const addImage = async (file: File) => {
    // Compress if needed
    const compressed = await compressImage(file)
    images.value.push({
      file: compressed,
      preview: URL.createObjectURL(compressed)
    })
  }

  onMounted(() => {
    document.addEventListener('paste', handlePaste)
  })

  onUnmounted(() => {
    document.removeEventListener('paste', handlePaste)
    images.value.forEach(img => URL.revokeObjectURL(img.preview))
  })

  return { images, handleDrop, addImage }
}
```

---

## 💳 Subscription Plans

```typescript
const plans = [
  {
    id: 'free',
    name: 'Free',
    price: 0,
    credits: 100,
    limits: {
      generationsPerDay: 10,
      storage: '1GB'
    },
    features: [
      '100 starting credits',
      '10 generations per day',
      'Basic models',
      'Community support'
    ]
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 9.99,
    credits: 300,
    limits: {
      generationsPerDay: 100,
      storage: '10GB'
    },
    features: [
      '300 credits/month',
      '100 generations per day',
      'All models',
      'No watermark',
      'Priority support',
      'API access'
    ],
    popular: true
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    features: [
      'Unlimited credits',
      'Unlimited generations',
      'Custom models',
      'Dedicated support',
      'SLA guarantee',
      'White-label option'
    ]
  }
]
```

---

## 🐳 Docker Setup

### docker-compose.yml
```yaml
version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    env_file: .env
    depends_on:
      - db
      - redis
    volumes:
      - ./backend:/app

  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      - VITE_API_URL=http://localhost:8000
    volumes:
      - ./frontend:/app

  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: imageai
      POSTGRES_USER: user
      POSTGRES_PASSWORD: pass
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf
    depends_on:
      - backend
      - frontend

volumes:
  postgres_data:
```

---

## ✅ MVP Features Checklist

### Must Have (Week 1-4)
- [ ] User authentication (register, login, JWT)
- [ ] Text-to-image generation
- [ ] Image-to-image generation
- [ ] Aspect ratio selection
- [ ] Image upload (drag & drop, paste)
- [ ] Image download
- [ ] User gallery (CRUD)
- [ ] Credits system
- [ ] Rate limiting
- [ ] Progress indication
- [ ] Error handling

### Should Have (Week 5-6)
- [ ] Subscription plans UI
- [ ] Stripe checkout
- [ ] Usage statistics
- [ ] Public gallery
- [ ] Search & filters
- [ ] Responsive design
- [ ] Dark/light theme

### Nice to Have (Week 7-8)
- [ ] Batch generation
- [ ] Image variations
- [ ] Advanced settings
- [ ] Social features (like, share)
- [ ] API keys for developers
- [ ] Admin panel

---

## 🎨 UI Components to Build

### Core Components
```
<Button>               - Primary, secondary, outline variants
<Input>                - Text input с validation
<TextArea>             - Auto-resize textarea
<Select>               - Dropdown selector
<Card>                 - Glass morphism card
<Modal>                - Overlay modal
<Toast>                - Notification system
<Progress>             - Progress bar
<Skeleton>             - Loading placeholder
<Avatar>               - User avatar
<Badge>                - Status badge
<Tabs>                 - Tab navigation
<Dropdown>             - Dropdown menu
```

### Feature Components
```
<PromptInput>          - Textarea с counter, random button
<ImageUploader>        - Drag & drop zone с preview
<ImageGrid>            - Masonry grid для gallery
<ResultDisplay>        - Сгенерированное изображение с actions
<SubscriptionCard>     - План подписки
<CreditsBadge>         - Баланс кредитов
<UsageChart>           - График использования
<AspectRatioSelector>  - 4 кнопки выбора
```

---

## 🚀 Deployment Checklist

### Environment Variables
```bash
# Backend
FAL_API_KEY=xxx
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
SECRET_KEY=xxx
STRIPE_SECRET_KEY=xxx
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
S3_BUCKET=imageai-storage
SENTRY_DSN=xxx

# Frontend
VITE_API_URL=https://api.example.com
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_xxx
```

### Pre-launch
- [ ] SSL certificate (Let's Encrypt)
- [ ] Domain setup
- [ ] Database backup strategy
- [ ] Monitoring (Sentry, CloudWatch)
- [ ] Load testing
- [ ] Security audit
- [ ] GDPR compliance
- [ ] Terms of Service
- [ ] Privacy Policy

---

## 📊 Success Metrics

**Week 1:** Infrastructure + Auth ✅
**Week 2:** Core generation working ✅
**Week 3:** Frontend MVP ✅
**Week 4:** Gallery + Credits ✅
**Week 5:** Subscriptions ✅
**Week 6:** Polish + Testing ✅
**Week 7:** Beta launch 🚀

**Target (Month 1):**
- 100+ users
- 1,000+ images generated
- 5+ paying subscribers
- 99% uptime

---

## 🎯 Key Differentiators

1. **Простота использования** - Минимум кликов до первого результата
2. **Скорость** - Оптимизирован для быстрых генераций
3. **Доступность** - Щедрый free tier
4. **Качество** - Лучшие AI модели (Fal.ai)
5. **Reliability** - Production-ready с первого дня

---

## 🔥 Prompt для Bolt.new (Copy-Paste)

```
Create a production-ready AI Image Generator SaaS with:

TECH STACK:
- Backend: FastAPI + PostgreSQL + Redis + Celery
- Frontend: Vue 3 + TypeScript + TailwindCSS + Vite
- Auth: JWT
- Payments: Stripe
- Storage: AWS S3
- AI: Fal.ai integration

FEATURES:
1. User authentication (register, login)
2. Main generator page with:
   - Text-to-image mode
   - Image-to-image mode (upload via drag-drop/paste)
   - Aspect ratio selector (1:1, 16:9, 9:16, 21:9)
   - Progress bar during generation
   - Result display with download/copy/save actions
3. User gallery (grid view, delete, search)
4. Credits system (100 free credits, 1 credit per generation)
5. Subscription plans (Free, Pro $9.99)
6. Profile page with usage stats
7. Rate limiting per tier

DESIGN:
- Dark theme with glass morphism
- Colors: #614B00 (primary), black background
- Modern, minimalist UI
- Responsive (mobile-first)

ARCHITECTURE:
- RESTful API with OpenAPI docs
- Repository pattern
- Async/await everywhere
- Docker Compose for local dev
- Proper error handling
- Security best practices (bcrypt, CORS, rate limiting)

Start with: Project structure, database models, auth system, and main generator page.
```

---

## 📝 Notes

- Используй async/await везде
- Валидируй все inputs через Pydantic
- Не забудь cleanup для URL.createObjectURL
- Rate limiting обязателен
- Все secrets в .env
- TypeScript strict mode
- 80%+ test coverage
- Lighthouse score 90+

**Время разработки:** 6-8 недель
**Budget:** $500-1000/month infrastructure
