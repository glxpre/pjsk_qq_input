# Project Sekai 贴纸生成器

一个功能完整、界面精美的 Project Sekai 角色贴纸生成器。支持自定义文字、样式和多种导出格式。

> 本项目参考了社区多个优秀实现，整合了最佳功能和用户体验。

## ✨ Features

### 🎨 Rich Text Customization
- **Multiple font options**: YurukaStd, SSFangTangTi, and System fonts
- **Text positioning**: Drag or use precise sliders for X/Y coordinates
- **Font size control**: 10-100px with smooth slider
- **Rotation**: -10 to +10 degrees for perfect angles
- **Line spacing**: 18-100px for multi-line text
- **Letter spacing**: -10 to +30px for custom character spacing
- **Stroke width**: 0-30px outline thickness
- **Custom colors**: Full color pickers for text and stroke
- **Text modes**:
  - Horizontal (default)
  - Vertical (top-to-bottom)
  - Curved (circular arc)
- **Layer control**: Place text behind or in front of character

### 🖼️ Image Features
- **370+ character stickers** from Project Sekai
- **26 unique characters** with multiple poses each
- **Custom image upload**: Use your own images (PNG, JPG, GIF, WebP)
- **Dynamic color extraction**: UI adapts to character colors
- **Search functionality**: Find characters by name or series

### 💾 Export Options
- **Copy to clipboard**: PNG or JPG with white background
- **Download files**: PNG, JPG, or WebP formats
- **WebP optimization**: High-quality web format support

### 🎯 User Experience
- **Material-UI design**: Clean, modern interface
- **Fully responsive**: Works on desktop, tablet, and mobile
- **Dark theme**: Easy on the eyes
- **Real-time preview**: See changes instantly
- **Keyboard shortcuts**: Quick position adjustments (±5px buttons)
- **Reset functionality**: Restore default settings anytime

## 🚀 Tech Stack

- **React 18** - Modern UI library with concurrent rendering
- **Vite 7** - Lightning-fast build tool and dev server
- **Material-UI 5** - Comprehensive component library
- **Fast Average Color** - Dynamic theme color extraction
- **HTML5 Canvas** - High-quality image rendering
- **Font Optimization** - Custom fonts with `font-display: swap`

## 📦 Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint

# Format code
npm run format
```

## 🎮 Usage

1. **Select a character**: Click the person icon to open the character picker
2. **Enter your text**: Type in the text field (supports multi-line with Enter)
3. **Customize appearance**:
   - Adjust font size, rotation, and spacing with sliders
   - Change text and stroke colors with color pickers
   - Try different fonts from the dropdown
4. **Position text**:
   - Use sliders for precise positioning
   - Click ±5px buttons for quick adjustments
5. **Export your sticker**:
   - Copy to clipboard (PNG or JPG)
   - Download as file (PNG, JPG, or WebP)

### Advanced Options

- **Curved Text**: Enable for circular text effect (great for sticker borders)
- **Vertical Text**: Traditional top-to-bottom text layout
- **Text Behind Image**: Place text as background layer
- **Custom Image**: Upload your own image instead of using character stickers
- **Letter Spacing**: Fine-tune spacing between individual characters

## 📁 Project Structure

```
sekai-stickers-merged/
├── public/              # Static assets
│   ├── img/            # Character sticker images (370+ PNGs)
│   └── site.webmanifest # PWA configuration
├── src/
│   ├── components/     # React components
│   │   ├── Canvas.jsx  # Canvas rendering wrapper
│   │   ├── Picker.jsx  # Character selection dialog
│   │   └── Info.jsx    # Credits/about dialog
│   ├── fonts/          # Custom font files
│   │   ├── YurukaStd.woff2
│   │   └── ShangShouFangTangTi.woff2
│   ├── App.jsx         # Main application component
│   ├── main.jsx        # React entry point
│   ├── index.css       # Global styles
│   ├── characters.json # Character database (5000+ lines)
│   └── config.json     # API configuration
├── index.html          # HTML entry point
├── vite.config.js      # Vite configuration
└── package.json        # Dependencies and scripts
```

## 🎨 Character Database

The project includes a comprehensive character database with:
- **31 unique characters** from Project Sekai
- **370+ sticker variations** with different poses and expressions
- Character metadata including:
  - Name and series
  - Image path
  - Default text, position, size, and rotation
  - Character-specific color theme

Characters include: Airi, Akito, An, Emu, Ena, Haruka, Honami, Ichika, KAITO, Kanade, Kohane, Len, Luka, Mafuyu, Meiko, Miku, Minori, Mizuki, Nene, Rui, Saki, Shiho, Shizuku, Toya, Tsukasa, and more!

## 🔧 Configuration

### API Endpoint
Edit `src/config.json` to change the API endpoint for analytics:
```json
{
  "apiUrl": "https://your-api-endpoint.com"
}
```

### Custom Fonts
Add custom fonts in `src/index.css`:
```css
@font-face {
  font-family: "YourFont";
  src: url(./fonts/YourFont.woff2) format("woff2");
  font-display: swap;
}
```

Then update the font stack in `src/App.jsx`.

## 🙏 Credits

This merged version combines and improves upon:

### Original Projects
- **[atnightcord/sekai-stickers](https://github.com/atnightcord/sekai-stickers)**
  - Complete feature implementation
  - Advanced text controls (vertical, curved, stroke, letter spacing)
  - Multiple export formats
  - Vite build configuration

- **[BedrockDigger/sekai-stickers](https://github.com/BedrockDigger/sekai-stickers)**
  - Beautiful Material-UI design
  - Responsive layout system
  - Dynamic color extraction
  - Polished user experience
  - PWA support

### Original Contributors
- **[u/SherenPlaysGames](https://www.reddit.com/r/ProjectSekai/comments/x1h4v1/)** - Original stamp creator
- **Ayaka** - Original idea and implementation
- **Modder4869** - Code contributions
- All other contributors to both original projects

## 📝 License

MIT License - See individual project repositories for their licenses.

## 🐛 Bug Reports & Feature Requests

Since this is a merged/modified version, please:
1. Check if the issue exists in the original projects
2. For new bugs specific to this merge, open an issue in this repository
3. For features from the original projects, check their repositories

## 🌟 What Makes This Merged Version Better?

### From atnightcord's version:
✅ Vertical text mode
✅ Letter spacing control
✅ Stroke width control
✅ Multiple font options
✅ Text behind/in-front layer control
✅ Custom image upload
✅ 5 export formats (PNG, JPG, WebP + clipboard variants)
✅ Vite build system (faster than CRA)

### From BedrockDigger's version:
✅ Material-UI components
✅ Responsive grid layout
✅ Dynamic theme colors from character images
✅ Snackbar notifications
✅ Polished button and slider controls
✅ Better mobile experience
✅ PWA manifest and icons

### New Improvements:
✅ Combined UI elegance with feature completeness
✅ Better organized component structure
✅ Improved error handling
✅ More intuitive control layout
✅ Enhanced accessibility
✅ Optimized bundle size with proper code splitting

## 🚢 Deployment

### Vercel (Recommended)
```bash
npm run build
# Deploy dist/ folder to Vercel
```

### Docker
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
RUN npm install -g serve
EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]
```

### Static Hosting
Build the project and deploy the `dist/` folder to any static hosting service:
- Netlify
- GitHub Pages
- Cloudflare Pages
- AWS S3 + CloudFront

## 🎓 Development Tips

### Adding New Characters
1. Place character images in `public/img/character-name/`
2. Add entries to `src/characters.json`:
```json
{
  "id": "character-01",
  "name": "Character Name 01",
  "character": "Character Series",
  "img": "character-name/01.png",
  "color": "#ff69b4",
  "defaultText": {
    "text": "Default text",
    "x": 148,
    "y": 200,
    "r": 0,
    "s": 30
  }
}
```

### Customizing Theme
Edit the theme object in `src/App.jsx`:
```javascript
const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: yourColor },
    // ... customize more
  },
})
```

## 📸 Screenshots

![Preview](public/screenshot_new_new.png)

---

**Built with ❤️ by combining the best of both worlds**
