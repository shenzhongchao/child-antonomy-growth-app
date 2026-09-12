# 插画素材说明

使用内置 imagegen 工具制作，未使用 CLI fallback。

原图存放在 `assets/`，`dist/` 里是转换后的 WebP（网页实际加载）。重新转换执行
`python scripts/optimize-images.py`。注意 `growth-art` 是 CSS 雪碧图，**不可缩放**，
见脚本内的说明。

## assets/storybook-scene.png

1536 × 1024，RGB。欢迎场景，角色在右侧，左侧用于页面文字。
Prompt brief: Original cheerful crayon/gouache children's storybook welcome landscape, golden five-point star explorer with tiny blue backpack and white bunny, right-side characters, open left sky, sunny meadow, flowers and rainbow, golden yellow/sky blue/green/coral palette, no text or interface.

## assets/star-friend.png

1254 × 1254，RGBA，透明背景。用于品牌、页面提示和完成反馈。
Prompt brief: Single rounded golden smiling star explorer waving, expressive eyes, tiny blue backpack, thick soft blue outline, matching gouache/crayon children's illustration style, transparent background, no text, fully visible with padding.

## assets/growth-art.png

沿用用户此前生成的 A4 自主力成长板，通过 CSS 裁切显示书包、图书、闹钟等图标。
`styles.css` 里 `.art` 用 `background-size: 738.5px 1043.7px` 加绝对像素
`background-position` 定位每个图标，所以这张图的**像素尺寸必须保持不变**——缩放会让
所有图标错位。
