# HTML in Canvas — 技術知識

## 情報ソース

- 仕様・提案: https://raw.githubusercontent.com/WICG/html-in-canvas/refs/heads/main/README.md
- Chrome のガイド（ベストプラクティス）: https://developer.chrome.com/docs/modern-web-guidance/guides/visual-design/expose-canvas-content-to-browser-features
- Chrome 155 での API 変更: https://developer.chrome.com/blog/html-in-canvas-ot-changes
- Three.js 実装例: https://raw.githubusercontent.com/mrdoob/three.js/refs/heads/master/examples/webgl_materials_texture_html.html
- Origin Trial 案内: https://developer.chrome.com/blog/html-in-canvas-origin-trial

不明点はこれらのソースを再取得して確認すること。

---

## HTML in Canvas とは

WICG 提案。HTML 要素を `<canvas>` に直接描画できるようにする API。
長年 canvas で対応が難しかったテキストスタイリング、アクセシビリティ、国際化、パフォーマンスの課題を解決する。

### 有効化

**Origin Trial** 状態（Chrome 148〜160。期限は 2027-03-02）。延長に合わせてトークンを更新している。

**Chrome 155 で API が大きく変わった**（`layoutsubtree` → `content="drawable"` + `drawable`、`texElementImage2D` → `texElementSubImage2D` など）。このリポジトリのデモは新しい API だけに対応している。

- 動作確認は **Chrome Canary** で行う。Stable（2026-11 時点で 156）は新旧の API が混在した移行中の状態で、`drawElementImage()` が値を返す・`getElementImageDefaultSize()` が無いなど、新しい API の前提で書いたコードが動かない。Canary 159 では旧 API（`layoutsubtree`・`texElementImage2D`）は削除済み。
- ローカルでの確認は Canary を `--enable-blink-features=HTMLInCanvas,CanvasDrawElement --enable-features=CanvasDrawElement,HTMLInCanvas` 付きで起動する（`localhost` では OT トークンが効かないため）。

#### Origin Trial トークンを使う場合

Origin Trial の[登録ページ](https://developer.chrome.com/blog/html-in-canvas-origin-trial)で発行したトークンを `<meta>` タグで埋め込むだけ。フラグ操作は不要で、訪問者のブラウザ側でも自動的に機能が有効になる:

```html
<meta http-equiv="origin-trial" content="YOUR_TOKEN_HERE">
```

トークン取得時のオプション:

- **サブドメイン対応**: 登録時に「Include subdomains」にチェックを入れると、`*.example.com` 全てで同じトークンが有効になる（例: `codegrid.github.io` で取得 → `foo.codegrid.github.io` でも有効）。
- **期限**: トークンの中央セクション (`.` で区切られたあとの base64) を decode すると JSON で確認できる。`expiry` は Unix timestamp、`isSubdomain` がサブドメインフラグ。例:
  ```json
  { "origin": "https://example.com:443", "feature": "HTMLInCanvas", "expiry": 1792454400, "isSubdomain": true }
  ```

#### ローカル開発・OT 未登録環境

Chrome フラグ `chrome://flags/#canvas-draw-element` で有効化できる。`localhost` は OT トークン無しでも特例で動く環境がある（仕様依存）。

---

## 対応コンテキスト

| コンテキスト | メソッド |
|---|---|
| 2D Canvas | `drawElementImage()` |
| OffscreenCanvas | `drawElementImage()` |
| WebGL | `texElementSubImage2D()` |
| WebGPU | `drawElementImageToTexture()` |

Chrome 154 までは WebGL が `texElementImage2D()`、WebGPU が `copyElementImageToTexture()` だった。

---

## コア API（共通）

### `content="drawable"` 属性と `drawable` 属性

canvas に `content="drawable"` を付けると、canvas の子孫要素がレイアウトされる（既定値は `content="fallback"` で、子孫は従来どおりのフォールバックコンテンツ）。canvas の直接の子要素はブロック化される。

描画したい要素には `drawable` 属性を付ける。canvas の子孫であればどこに置いてもよく、直接の子要素である必要はない。ただし直接の子要素でも `drawable` は省略できない。

```html
<canvas content="drawable">
	<div id="content" drawable>
		<p>Hello <strong>Canvas!</strong></p>
	</div>
</canvas>
```

- `drawable` を付けた要素は `isolation: isolate` になり、子孫すべての containing block になる。
- `drawable` を付けた要素は、子孫ごと描画される。ただし `drawable` の付いた子孫（入れ子）は含まれないので、別に描く。
- `drawElementImage()` に `drawable` の付いていない要素や、別の canvas の中の要素を渡すと例外になる。
- canvas 自体は通常の DOM 要素として表示される。子孫要素は描画 API で canvas に描かれることで画面に現れ、要素そのものは直接は表示されない。

Chrome 154 までは `<canvas layoutsubtree>` で、`drawable` で印を付ける必要はなく、canvas の子要素をそのまま描画 API に渡していた。

### `drawable` の入れ子で、一部の要素だけを別に描く

`drawable` は入れ子にでき、それぞれを別々に描画できる。外側の要素を描いても、中の `drawable` 要素は含まれない（そこは空く）。中の要素だけを別のテクスチャに描けば、その部分にだけエフェクトをかけられる（デモ 6）。

```html
<canvas content="drawable">
	<div class="SlimeText" drawable>
		<!-- .SlimeText を描いても「鼻水」は含まれない。em は別に描く -->
		<p>つらい<em drawable>鼻水</em>、鼻詰まり</p>
	</div>
</canvas>
```

- 外側と中の要素を、シェーダーで元の位置に重ねて合成する。中の要素の canvas 内での位置は `getOffsetInCanvas()`（下記）で求める。
- 中の要素も、ヒットテスト用の位置を `updateElementGeometry()` で登録しないとクリックできない（外側を登録しても中は含まれない）。
- インライン要素は `display: inline-block` にして、1 つの矩形として描く。
- Three.js の `HTMLTexture` は中の要素には使えない（「Three.js との統合」を参照）。

### `drawable` の要素の `getBoundingClientRect()` はレイアウト位置を返さない

`drawable` を付けた要素の `getBoundingClientRect()` は、レイアウト上の位置ではなく、**`updateElementGeometry()` で登録した位置**（未登録なら canvas の左上）を返す。その子孫（`drawable` なし）も、外側の `drawable` 要素に登録した位置を基準にした値になる。

Canary 159 での実測: canvas の中の (471, 240) にレイアウトされた入れ子の `em` で、登録前の `getBoundingClientRect()` は canvas の左上 (0, 0) の位置を返した。`offsetLeft` / `offsetTop` は (471, 240)（`offsetParent` は外側の `drawable` 要素）だった。

レイアウト上の位置が要るときは、`offsetLeft` / `offsetTop` を `offsetParent` までたどって足し合わせる。共通処理の `html-in-canvas.js` に `getOffsetInCanvas( canvas, element )` を用意してある。

canvas の左上にある要素（全面に描く要素）では、登録前の `getBoundingClientRect()` がたまたま正しい位置になるので、ずれに気づきにくい。

### ヒットテスト（クリック・ホバー）は自動ではない

`content="drawable"` の canvas の子孫要素は、**初期状態ではヒットテストの対象にならない**（Chrome 154 までの `layoutsubtree` では、子要素はレイアウトされた位置でそのままクリックできた）。

- 2D: `drawElementImage()` で描くと、描いた位置が自動でヒットテスト用に登録される。
- WebGL / WebGPU: `canvas.updateElementGeometry()` で、描いた位置を自分で登録する（下記）。登録しないと、`addEventListener` を付けてもクリックやホバーが届かず、スクロールもできない。

### `onpaint` / `requestPaint()`
DOM の変化・CSS transition・CSS animation など、`drawable` 要素の描画内容が変化するタイミングに合わせて自動で発火する。基本的には `onpaint` を監視するだけでよい。

`requestPaint()` は変化がない場合でも強制発火させるためのもの（`requestAnimationFrame` 相当）。

本来の DOM の描画更新とは別に、Three.js などシェーダーアニメーションがある場合は、`onpaint` とは独立してシェーダー側のアニメーションループで再レンダリングする。

イベントオブジェクト（`CanvasPaintEvent`）には `changedElements`（`FrozenArray<Element>`）が含まれ、変化した要素だけを再描画する最適化に使える。

```js
canvas.onpaint = ( event ) => {
	for ( const el of event.changedElements ) {
		// 変化した要素だけ再描画
	}
};
```

### `updateElementGeometry()`
`HTMLCanvasElement` と `OffscreenCanvas` のメソッド。要素を canvas のどこに描いたかを登録し、ヒットテストとアクセシビリティ（スクリーンリーダーのフォーカスリングなど）の位置を描画に合わせる。主に WebGL / WebGPU で使う（2D は `drawElementImage()` が自動で呼ぶ）。

```js
canvas.updateElementGeometry( element, {
	canvasTransform,             // DOMMatrix: 要素のボーダーボックス → canvas
	canvasClip,                  // DOMRect: 一部だけ描いた場合のヒットテスト用クリップ（canvasTransform の座標系）
	preserveHitTestOrder: false, // true なら既に登録済みのとき重なり順を変えない
} );

canvas.clearElementGeometry( element ); // 登録を消す
canvas.getElementTransform( element );  // 登録済みの canvasTransform を返す（未登録なら単位行列）
```

要素の CSS transform は描画にもヒットテストにも使われない（Chrome 154 までのように `element.style.transform` を書き換える必要はない）。

#### `canvasTransform` は CSS px → canvas の CSS px

`canvasTransform` は「**要素のボーダーボックス（CSS transform 前、CSS px）→ canvas の CSS px 座標**」の写像。canvas grid（バックバッファ、`canvas.width` / `canvas.height`）の device pixel ではない。

Canary 159 での実測: CSS 400×200・grid 800×400 の canvas に、2D で `drawElementImage( el, 400, 200 )`（grid 座標）と描くと、自動で登録される `canvasTransform` は `translate( 200, 100 )` になる。WebGL でも `translate( 200, 100 )` を登録すると、canvas の CSS 座標 (200, 100) の位置でクリックできた。

grid pixel を混ぜると dpr 倍 (デスクトップだと 2 倍程度) ヒットエリアがズレる。Chrome 154 までの `getElementTransform( element, drawTransform )` は grid 座標で組む必要があったので、古いコードを移すときは単位に注意する。

WebGL/WebGPU で 3D に描く場合（デモ 2）:

```js
const canvasW = canvas.clientWidth;  // CSS px
const canvasH = canvas.clientHeight;

// element 座標 (top-left 原点, y-down、CSS px) → mesh ローカル座標 (中心原点, y-up)
const elementToLocal = new DOMMatrix( [
	planeWidth / elWidth,  0,                       0, 0,
	0,                    -planeHeight / elHeight,  0, 0,
	0,                     0,                       1, 0,
	-planeWidth / 2,       planeHeight / 2,         0, 1,
] );

// NDC → canvas の CSS px 座標 (top-left, y-down)
const ndcToCanvas = new DOMMatrix( [
	canvasW / 2, 0,            0, 0,
	0,          -canvasH / 2,  0, 0,
	0,           0,            1, 0,
	canvasW / 2, canvasH / 2,  0, 1,
] );

const canvasTransform = ndcToCanvas
	.multiply( new DOMMatrix( [ ...camera.projectionMatrix.elements ] ) )
	.multiply( new DOMMatrix( [ ...camera.matrixWorldInverse.elements ] ) )
	.multiply( new DOMMatrix( [ ...mesh.matrixWorld.elements ] ) )
	.multiply( elementToLocal );

canvas.updateElementGeometry( element, { canvasTransform } );
```

レイアウトどおりの位置に等倍で描くだけ（ページ全体にエフェクトをかける、入れ子の要素を元の位置に重ねるなど）なら、レイアウト位置をそのまま登録すればよい。共通処理の `html-in-canvas.js` に `syncElementGeometry( canvas, element )` を用意してある（位置は `getOffsetInCanvas()` で求める）。canvas や要素のサイズ・位置が変わったら呼び直す。

### `captureElementImage()` / `getElementImageDefaultSize()`
`captureElementImage()` は `HTMLCanvasElement` のメソッド。`drawable` 要素の最新のスナップショットを、転送可能な `ElementImage` として返す。
Worker スレッドへ転送し、各描画メソッドに `Element` の代わりに渡すことで `OffscreenCanvas` でのオフスレッド描画ができる。使い終わったら `close()` でリソースを解放する。

`ElementImage` 自体はサイズを持たない。既定の描画サイズは `canvas.getElementImageDefaultSize( element or elementImage )` で取得する（**canvas grid 座標**。CSS px × grid/CSS 比。**小数になることがある**）。

```js
const elementImage = canvas.captureElementImage( element );
worker.postMessage( { elementImage }, [ elementImage ] );

// Worker 側で（WebGL）:
gl.texElementSubImage2D( gl.TEXTURE_2D, 0, 0, 0, elementImage );

// 使い終わったら解放
elementImage.close();
```

---

## Canvas 2D — `drawElementImage`

`CanvasRenderingContext2D` のメソッド。`drawable` 要素を canvas に描画する。返り値は無い（void）。
canvas の現在の変換行列が適用される。source 要素の CSS transform は描画には無視される。

描画と同時に、描いた位置がヒットテスト用に自動で登録される（`updateElementGeometry()` が自動で呼ばれる）。Chrome 154 までのように、戻り値の transform を `element.style.transform` に入れる必要はない。

```js
canvas.onpaint = () => {
	ctx.reset();
	ctx.drawElementImage( element, 0, 0 );
};
```

同じ要素を複数回描くなど、位置の登録を自分で制御したいときは `{ preserveElementGeometry: true }` を最後の引数に渡し、`canvas.updateElementGeometry()` で登録する。

オーバーロードでソース領域のクロップや出力サイズも指定できる:

```js
// 出力先サイズを指定
ctx.drawElementImage( element, dx, dy, dwidth, dheight );

// ソース領域を指定して出力先へ
ctx.drawElementImage( element, sx, sy, swidth, sheight, dx, dy );
ctx.drawElementImage( element, sx, sy, swidth, sheight, dx, dy, dwidth, dheight );

// どれも最後に options を渡せる
ctx.drawElementImage( element, 0, 0, { preserveElementGeometry: true } );
```

---

## WebGL — `texElementSubImage2D`

`WebGLRenderingContext` に追加されるメソッド。`drawable` 要素の描画内容を、確保済みのテクスチャに書き込む。
`element` には DOM 要素または `captureElementImage()` で取得した `ElementImage` を渡せる（後者はワーカースレッドから呼び出せる）。

**テクスチャの領域は自動では確保されない**。先に `texImage2D` で確保しておく。サイズは `getElementImageDefaultSize()` で取れるが、小数になることがあるので **切り上げる**（切り捨てると `GL_INVALID_VALUE: glCopySubTextureCHROMIUM: Offset overflows texture dimensions.` になる）。確保しないで呼ぶと `GL_INVALID_OPERATION: ... The destination level of the destination texture must be defined.` になる。

```js
const size = canvas.getElementImageDefaultSize( element );
const width = Math.ceil( size.width );
const height = Math.ceil( size.height );

gl.bindTexture( gl.TEXTURE_2D, texture );
gl.texImage2D( gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null );
gl.texElementSubImage2D( gl.TEXTURE_2D, 0, 0, 0, element );

// config でソース領域のクロップや書き込みサイズを指定することもできる
gl.texElementSubImage2D( gl.TEXTURE_2D, 0, 0, 0, element, {
	sx: 0, sy: 0, swidth: 480, sheight: 670,
	width: 512, height: 512,
} );

// テキストを含む場合はミップマップより LINEAR フィルタが良好
gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR );
```

シグネチャ: `texElementSubImage2D( target, level, xoffset, yoffset, element[, config] )`

> **注: シグネチャの変遷。** Chrome 138–149 は `texElementImage2D( target, level, internalformat, srcformat, srctype, element )`、Chrome 150–154 は `texElementImage2D( target, internalformat, element[, config] )`（領域も自動で確保）、Chrome 155+ は `texElementSubImage2D`（領域は自分で確保）。

---

## WebGPU — `drawElementImageToTexture`

`GPUQueue` に追加されるメソッド。`drawable` 要素の描画内容を GPU テクスチャに描く。
`source` には DOM 要素または `ElementImage` を渡せる（後者はワーカースレッドから呼び出せる）。

```js
device.queue.drawElementImageToTexture(
	{ source: element },
	{ texture: gpuTexture, size: [ 512, 512 ] }
);

// ソース領域のクロップも指定できる
device.queue.drawElementImageToTexture(
	{ source: element, sourceX: 0, sourceY: 0, sourceWidth: 480, sourceHeight: 670 },
	{ texture: gpuTexture, size: [ 512, 512 ] }
);
```

Chrome 154 までは `copyElementImageToTexture( { source, sx, sy, swidth, sheight }, { destination, width, height } )`。Chrome 150 で引数が辞書オブジェクトになり、Chrome 155 で名前と項目名が変わった。

---

## 最小完全例

### 2D Canvas

```html
<canvas id="canvas" content="drawable">
	<div id="content" drawable>
		<p>Hello <strong>Canvas!</strong></p>
	</div>
</canvas>
<script>
	const canvas  = document.getElementById( 'canvas' );
	const content = document.getElementById( 'content' );
	const ctx     = canvas.getContext( '2d' );

	canvas.style.width  = `${ content.offsetWidth }px`;
	canvas.style.height = `${ content.offsetHeight }px`;

	const observer = new ResizeObserver( ( [ entry ] ) => {
		canvas.width  = entry.devicePixelContentBoxSize[ 0 ].inlineSize;
		canvas.height = entry.devicePixelContentBoxSize[ 0 ].blockSize;
	} );
	observer.observe( canvas, { box: 'device-pixel-content-box' } );

	canvas.onpaint = () => {
		ctx.reset();
		ctx.drawElementImage( content, 0, 0 );
	};
</script>
```

### WebGL

HTML in Canvas 固有の部分のみ示す。WebGL のシェーダー・バッファ設定などは通常の WebGL と同様。

```html
<canvas id="canvas" content="drawable">
	<div id="element" drawable>...</div>
</canvas>
<script>
	const canvas  = document.getElementById( 'canvas' );
	const element = document.getElementById( 'element' );
	const gl      = canvas.getContext( 'webgl2' );

	const texture = gl.createTexture();

	canvas.onpaint = () => {

		const size = canvas.getElementImageDefaultSize( element );
		gl.bindTexture( gl.TEXTURE_2D, texture );
		gl.texImage2D( gl.TEXTURE_2D, 0, gl.RGBA8, Math.ceil( size.width ), Math.ceil( size.height ), 0, gl.RGBA, gl.UNSIGNED_BYTE, null );
		gl.texElementSubImage2D( gl.TEXTURE_2D, 0, 0, 0, element );
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR );
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE );
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE );

		// ここで通常の WebGL 描画

		// 描いた位置をヒットテスト用に登録する（canvas いっぱいに等倍で描いた場合）
		canvas.updateElementGeometry( element, { canvasTransform: new DOMMatrix() } );

	};
</script>
```

### WebGPU

HTML in Canvas 固有の部分のみ示す。デバイス・パイプライン設定などは通常の WebGPU と同様。

```html
<canvas id="canvas" content="drawable">
	<div id="element" drawable>...</div>
</canvas>
<script type="module">
	const canvas  = document.getElementById( 'canvas' );
	const element = document.getElementById( 'element' );

	const adapter = await navigator.gpu.requestAdapter();
	const device  = await adapter.requestDevice();

	const texture = device.createTexture( {
		size: [ 400, 300 ],
		format: 'rgba8unorm',
		usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
	} );

	canvas.onpaint = () => {

		device.queue.drawElementImageToTexture(
			{ source: element },
			{ texture, size: [ 400, 300 ] }
		);

		// ここで通常の WebGPU 描画
		// ヒットテストが要るなら WebGL と同じく canvas.updateElementGeometry() で登録する

	};
</script>
```

Three.js は「Three.js との統合」セクションを参照。

---

## 共通パターン

### Canvas サイズ設定（2D context）
子要素のサイズを canvas の CSS サイズに適用してから、ResizeObserver で物理ピクセル数を反映する2ステップが必要。

```js
// Step 1: 子要素の CSS サイズを canvas の CSS サイズとして設定
canvas.style.width  = `${ element.offsetWidth }px`;
canvas.style.height = `${ element.offsetHeight }px`;

// Step 2: ResizeObserver で物理ピクセル数を canvas.width/height に反映
const resizeObserver = new ResizeObserver( ( [ entry ] ) => {
	const px = entry.devicePixelContentBoxSize[ 0 ];
	canvas.width  = px.inlineSize;
	canvas.height = px.blockSize;
} );
resizeObserver.observe( canvas, { box: 'device-pixel-content-box' } );
```

### Canvas サイズ設定（WebGL / Three.js, DPR 変化追従）

`WebGLRenderer` は `setPixelRatio(dpr)` + `setSize(cssW, cssH)` で device px のバックバッファを管理する。CSS サイズと **dpr** の両方を追跡し、変化があれば両方を再適用する。

#### `window.addEventListener('resize')` だけでは取り逃す

dpr-only の変化 (異 dpr ディスプレイへの window 移動、`zoom` 操作の一部) では window の `resize` が発火しないケースがある。`ResizeObserver(box: 'device-pixel-content-box')` で canvas を監視すれば、CSS サイズ変化と dpr 変化の両方を 1 つの observer で拾える (dpr が変われば同じ CSS サイズでも device px が変わるので発火する)。

#### パターン

```js
let canvasCssW = 0;
let canvasCssH = 0;
let canvasDpr  = 0;

function syncCanvasSize() {

	const w = element.offsetWidth;
	const h = element.offsetHeight;
	const dpr = window.devicePixelRatio;
	if ( w === 0 || h === 0 ) return false;
	if ( w === canvasCssW && h === canvasCssH && dpr === canvasDpr ) return false;

	canvasCssW = w;
	canvasCssH = h;
	canvasDpr  = dpr;
	renderer.setPixelRatio( dpr );
	renderer.setSize( w, h, false );
	// dpr 依存の uniform (e.g. uPointSize = 1.0 * dpr, blob RT サイズ等) もここで更新する
	pointMaterial.uniforms.uPointSize.value = 1.0 * dpr;

	return true;

}

const resizeObserver = new ResizeObserver( () => {

	if ( syncCanvasSize() ) {
		// resample / RT resize / 派生 uniform 更新などのトリガ
	}

} );
resizeObserver.observe( canvas, { box: 'device-pixel-content-box' } );
```

`canvasDpr` を比較対象に入れずに `w, h` だけで早期 return すると、ディスプレイ間移動で dpr だけ変わったときに `setPixelRatio` と派生 uniform が古いままになる (バックバッファの解像度がズレ、`uPointSize` 等が前 dpr のサイズで残る)。

### 粒子数を CSS 単位で計算する (DPR 不変な見かけ密度)

HTMLTexture を device 解像度 (`rect * dpr`) の RT に焼いて `readPixels` で opaque pixel を集め、その pool サイズに比例して粒子数を決めるパターン (`drawElementImage` / `texElementSubImage2D` どれでも同じ) では、pool サイズが dpr² でスケールする。

「不透明 1 device px あたり N 粒子」で count を決めると Retina (dpr=2) では非 Retina の **4 倍** の粒子になり、見かけの密度が dpr で変わってしまう。

#### 対策

pool サイズを CSS 単位に換算 (`/ (dpr * dpr)`) してから density を掛ける:

```js
const dpr = window.devicePixelRatio;
const count = Math.round( opaquePoolSize * PARTICLE_DENSITY / ( dpr * dpr ) );
particleGeometry.setDrawRange( 0, count );
```

`PARTICLE_DENSITY` の意味づけは「不透明 1 CSS px あたりの粒子数」になる。同様に、粒子サイズを比例させる場合 (e.g. blob を em の font サイズに合わせる) も、source が CSS px ベースか device / RT px ベースかを明示しないと dpr 倍ズレる。

### ブラウザ判定
```js
if ( ! ( 'content' in HTMLCanvasElement.prototype ) ) {
	// ネイティブ未対応
}
```

Chrome のガイドの判定方法。Chrome 154 までは `'requestPaint' in HTMLCanvasElement.prototype` で判定していた（`requestPaint` は今もあるが、旧 API しか無いブラウザも通ってしまう）。

### canvas 直下の要素には `width: 100%` を明示する

Chrome 154 までの `layoutsubtree` で確認した問題。`content="drawable"` でも canvas の直接の子要素はブロック化される特殊なレイアウトなので、同じ対策を続けている。

`<canvas layoutsubtree>` の直接の子要素は仕様上 stacking context + containing block + paint containment を持つが、Chrome 実装では **block / flex container でも width が containing block の 100% に自動展開されない** ケースがある。

通常 DOM では block 要素は親の content width を default で占めるが、layoutsubtree 配下では containing-block 解決ロジックが異なるらしく、子孫の `max-width + auto margin` や flex item の幅計算が main DOM 表示と一致しなくなる。

#### 症状

`<canvas layoutsubtree>` 内に full-viewport 用のセクション (`min-height: 100vh` + `display: flex; align-items: center` 等) を入れ、その内側に `max-width: 1152px; margin: 0 auto` で中央寄せされる grid を置くと、テクスチャに焼き込まれる時の grid 位置が main DOM の表示とズレる。max-width 未満のビューポート (cap が効かない領域) では問題が起きず、max-width 超のビューポートで content が左寄りに/横に伸びて見える。

#### 対策

canvas 配下に置く可能性のある「フルビュー型」のルート要素には、明示的に `width: 100%` を付ける:

```css
.MySection {
	width: 100%;  /* canvas 配下でも containing block を確実に占有させる */
	min-height: 100vh;
	display: flex;
	flex-direction: column;
	align-items: center;
	/* ... */
}
```

これだけで内側の `max-width + margin: auto` 中央寄せが main DOM と canvas 配下の両方で同じ結果になる。

---

### 動的に挿入した `<img>` は `decode()` を待ってから snapshot を焼く

`<canvas content="drawable">` に動的に DOM を挿入する場面 (ページ遷移用にセクションをクローンして append する等) で、配下に `<img>` を含むと最初の `onpaint` がビットマップ未デコードのまま発火することがある。その状態で `drawElementImage` / `texElementSubImage2D` / `drawElementImageToTexture` を呼ぶと画像が抜けた snapshot がそのまま焼かれ、curl / fade などの直前 1〜2 フレームだけ画像が消えたように見える。

#### 症状

main DOM ではキャッシュ済みで即表示できる `<img>` でも、`cloneNode(true)` → `canvas.appendChild()` で canvas 配下に置いた瞬間は decode 状態が独立にリセットされる。`onpaint` は layout 完了で発火するため、decode が間に合わないまま「画像領域が空白」の状態でテクスチャが作られる。

#### 対策

挿入後、最初の paint を待つより前にクローン内の `<img>` 全てに対して `decode()` を await する。decode 済みのキャッシュ画像なら即 resolve するので体感の遅延はない。

```js
clone.setAttribute( 'drawable', '' ); // 描画する要素には drawable が要る
canvas.appendChild( clone );

// onpaint より前にビットマップを揃える
const imgs = clone.querySelectorAll( 'img' );
await Promise.all( Array.from( imgs ).map( ( img ) => img.decode().catch( () => {} ) ) );

// この後で HTMLTexture / drawElementImage 等の初回 snapshot を作る
const texture = new THREE.HTMLTexture( clone );
```

`decode()` は HTMLImageElement の標準 API。失敗時 (broken image 等) に reject するため `.catch()` で握りつぶしておくと安全。

---

## プライバシー制限

以下は描画されない:
- クロスオリジンの埋め込みコンテンツ
- システム設定
- スペルチェックマーカー
- 訪問済みリンク情報
- サブピクセルアンチエイリアシング

---

## Three.js との統合

`THREE.HTMLTexture` を使う。HTML in Canvas 専用の実装で、[PR #31233](https://github.com/mrdoob/three.js/pull/31233) で追加（2026-04-10 マージ）。**r184 で導入**された。

- ソース: https://raw.githubusercontent.com/mrdoob/three.js/refs/heads/dev/src/textures/HTMLTexture.js
- ※ 同名の旧実装（`examples/jsm/renderers/HTMLMesh.js` の `HTMLTexture`）は別メカニズムで、現在は削除されている。

### Three.js は Chrome 155 以降の API に未対応（r187・dev ブランチとも、2026-11 時点）

Three.js の `WebGLTextures` は、`'texElementImage2D' in _gl` のときだけ HTMLTexture をアップロードする。Chrome 155 以降は `texElementImage2D` が無いので、そのままでは HTMLTexture が描かれない。

このリポジトリでは、共通処理 `html-in-canvas.js`（リポジトリ直下）で、旧 API と同じ呼び出し方の `texElementImage2D( target, internalformat, element )` を、`texImage2D`（領域の確保）+ `texElementSubImage2D` で組み立てて補っている。Three.js を読み込んだあとに import するだけでよい:

```js
import * as THREE from 'three';
import { syncElementGeometry } from '../html-in-canvas.js'; // ヒットテストが要らなければ import '../html-in-canvas.js';
```

Three.js が新しい API に対応したら、このシムは不要になる。対応状況は `WebGLTextures.js` の `isHTMLTexture` の分岐で確認する。

Three.js は canvas に `content="drawable"` も `drawable` も付けない（`layoutsubtree` 属性を付けようとするが、今は意味がない）。**マークアップに自分で書く**。

### 入れ子の `drawable` 要素には `HTMLTexture` を使えない

Three.js の `WebGLTextures` は、`HTMLTexture` の要素が canvas の直接の子要素でないと、`canvas.appendChild()` で canvas の直下へ移動してしまう（要素を `document.createElement()` で作るパターン B のための処理）。入れ子の `drawable` 要素に使うと、レイアウトが崩れる。

入れ子の要素は、WebGL に直接書き込んだテクスチャを `THREE.ExternalTexture` で Three.js に渡す（デモ 6）。Three.js の `WebGLState` がテクスチャのバインドと `pixelStorei` をキャッシュしているので、`renderer.state` 経由で設定する:

```js
const gl = renderer.getContext();
const glTexture = gl.createTexture();
const texture = new THREE.ExternalTexture( glTexture ); // ShaderMaterial の uniform などに渡す

// onpaint のあと（アニメーションループの中でよい）で書き込む
const size = canvas.getElementImageDefaultSize( element );
renderer.state.bindTexture( gl.TEXTURE_2D, glTexture );
renderer.state.pixelStorei( gl.UNPACK_FLIP_Y_WEBGL, true ); // HTMLTexture と同じ向きにする
renderer.state.pixelStorei( gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false );
gl.texImage2D( gl.TEXTURE_2D, 0, gl.RGBA8, Math.ceil( size.width ), Math.ceil( size.height ), 0, gl.RGBA, gl.UNSIGNED_BYTE, null );
gl.texElementSubImage2D( gl.TEXTURE_2D, 0, 0, 0, element );
gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR );
gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE );
gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE );
```

`ExternalTexture` はフィルタやラップを Three.js が設定しないので、自分で `texParameteri` する。`getElementImageDefaultSize()` は canvas のサイズが変わると変わるので、リサイズ時にも書き込み直す。

また、Three.js は描いた位置をヒットテスト用に登録しない。クリック・ホバー・スクロールが要るなら `canvas.updateElementGeometry()` を自分で呼ぶ（「ヒットテスト（クリック・ホバー）は自動ではない」を参照）。全面に等倍で描くデモは `syncElementGeometry( canvas, element )` を、サイズを合わせる処理（`setSize` など）の最後で呼んでいる。

### 最小例

```html
<canvas id="canvas" content="drawable">
	<div id="element" drawable>
		<p>Hello <strong>Three.js!</strong></p>
	</div>
</canvas>

<script type="importmap">
{ "imports": {
	"three": "https://cdn.jsdelivr.net/npm/three@X.XXX.X/build/three.module.js",
	"three/addons/": "https://cdn.jsdelivr.net/npm/three@X.XXX.X/examples/jsm/"
} }
</script>
<script type="module">
import * as THREE from 'three';
import '../html-in-canvas.js';

const canvas  = document.getElementById( 'canvas' );
const element = document.getElementById( 'element' );

const renderer = new THREE.WebGLRenderer( { canvas, antialias: true } );
renderer.setPixelRatio( window.devicePixelRatio );
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.setAnimationLoop( animate );

const camera = new THREE.PerspectiveCamera( 50, window.innerWidth / window.innerHeight, 1, 2000 );
camera.position.z = 500;

const scene = new THREE.Scene();

const material = new THREE.MeshBasicMaterial();
material.map = new THREE.HTMLTexture( element );

const mesh = new THREE.Mesh( new THREE.BoxGeometry( 200, 200, 200 ), material );
scene.add( mesh );

function animate( time ) {

	mesh.rotation.y = time * 0.001;
	renderer.render( scene, camera );

}
</script>
```

### 基本パターン

要素の配置方法は 2 通り:

**A. `<canvas content="drawable">` の子として HTML に直接書く（このリポジトリのデモはすべてこちら）**

`HTMLTexture` のコンストラクタが `element.parentNode` を見て、`requestPaint` を持つ canvas であれば自動で `canvas.onpaint` を登録して `requestPaint()` を呼ぶ。ユーザーは `onpaint` セットアップ不要。

```html
<canvas id="canvas" content="drawable">
	<div id="element" drawable>...</div>
</canvas>
```

```js
const element = document.getElementById( 'element' );
material.map = new THREE.HTMLTexture( element );
```

**B. `document.createElement()` で生成（canvas の外）**

Three.js の `WebGLTextures` が初回アップロード時に要素を renderer の canvas に移し、`onpaint` を登録する。`content="drawable"` と `drawable` は付けてくれないので、自分で付ける。

```js
renderer.domElement.setAttribute( 'content', 'drawable' );

const element = document.createElement( 'div' );
element.setAttribute( 'drawable', '' );
element.innerHTML = `<p>Hello <strong>Canvas!</strong></p>`;
material.map = new THREE.HTMLTexture( element );
```

### 経緯: Chrome 150 での `texElementImage2D` の変更と r184 のバグ

Chrome 150 で `texElementImage2D` が 6 引数から 3 引数 `( target, internalformat, element[, config] )` に変わり、r184 は旧 6 引数のみで呼んでいたため `The provided value is not of type '(Element or ElementImage)'` エラーになった。[PR #33788](https://github.com/mrdoob/three.js/pull/33788)（2026-06-12 マージ）で `_gl.texElementImage2D.length === 3` で判定して両対応になり、r185 以降で直った。

Chrome 155 で `texElementImage2D` そのものが無くなったので、今は上記のシムで補っている（シムは 3 引数版として振る舞うので、r185 以降の Three.js の 3 引数の分岐に乗る）。

### 初回 `onpaint` 前に `render()` を呼ぶとエラー

#### 状況

`setAnimationLoop` はレンダラー生成直後から動き出す。`onpaint` が一度も発火していない状態でテクスチャのアップロード（Three.js からはシム経由の `texElementSubImage2D`）が呼ばれるとエラーになる。Chrome 154 までは次のメッセージだった:

```
InvalidStateError: Failed to execute 'texElementImage2D': No cached paint record for element.
```

#### 原因

`texElementSubImage2D`（Chrome 154 までは `texElementImage2D`）は `onpaint` によってキャッシュされた paint record を参照するため、`onpaint` 発火前には呼べない。

#### 回避策

`HTMLTexture` のコンストラクタが `canvas.onpaint` を登録するため、その直後にラップして初回 paint を検知し、フラグが立つまで `render()` をスキップする:

```js
const texture = new THREE.HTMLTexture( element );

let painted = false;
const _htmlTexturePaint = canvas.onpaint;
canvas.onpaint = ( e ) => {

	painted = true;
	if ( _htmlTexturePaint ) _htmlTexturePaint.call( canvas, e );

};

renderer.setAnimationLoop( () => {

	if ( ! painted ) return;
	renderer.render( scene, camera );

} );
```

---

### HTMLTexture の色が薄くなる（color space 二重適用）

#### 状況

`texElementSubImage2D`（Chrome 154 までは `texElementImage2D`）はブラウザが sRGB でレンダリングした画素データをテクスチャに直接アップロードする。Three.js は r152 以降 `outputColorSpace` のデフォルトが `SRGBColorSpace` になっており、`MeshBasicMaterial` 使用時はシェーダー末尾に linear → sRGB の gamma encode が自動注入される。

`texture.colorSpace = THREE.SRGBColorSpace` を設定して sRGB → linear デコードを入れても、Three.js の HTMLTexture では HTML in Canvas のアップロードパスでデコードが空振りするため、gamma encode だけが適用されて色が明るくなる。

#### 回避策

```js
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
```

gamma encode ステップを無効にすることで HTML の sRGB 値がフレームバッファにそのまま書き込まれ、正しい色で表示される。

---

### スクロール時に 3D オーバーレイの位置がテクスチャから遅延する

#### 状況

DOM 要素の位置に追従して 3D メッシュを配置するパターン（テキストプレーン上にスクロール連動で 3D モデルを重ねるなど）で、`renderer.setAnimationLoop` 内で毎フレーム `getBoundingClientRect()` を読んで `mesh.position` を更新すると、スクロール時にテクスチャ側のスクロールと 3D メッシュの位置にズレが生じて見える。

#### 原因

- `texElementSubImage2D` は `onpaint` で更新された paint record キャッシュを参照する。テクスチャ内容は前回 `onpaint` 発火時点の DOM 状態。
- `getBoundingClientRect()` は現在のライブ DOM レイアウトを返す。

rAF 内で位置更新すると、テクスチャ（過去の paint 時点）とメッシュ位置（現在の DOM）が 1 フレーム分ズレる。

#### 回避策

位置更新を `onpaint` ハンドラ内に移して、テクスチャキャッシュの更新と同じ paint サイクルで実行する。`mixer.update()` や `renderer.render()` は従来通り rAF 内で毎フレーム回す。

```js
function updateOverlayPositions() {

	const w = window.innerWidth;
	const h = window.innerHeight;

	if ( mesh ) {

		const rect = element.getBoundingClientRect();
		mesh.position.x = rect.left + rect.width  / 2 - w / 2;
		mesh.position.y = - ( rect.top + rect.height / 2 - h / 2 );

	}

}

const _htmlTexturePaint = canvas.onpaint;
canvas.onpaint = ( e ) => {

	updateOverlayPositions();
	if ( _htmlTexturePaint ) _htmlTexturePaint.call( canvas, e );

};

renderer.setAnimationLoop( () => {

	if ( mixer ) mixer.update( clock.getDelta() );
	renderer.render( scene, camera );

} );
```

#### 注意: 非同期ロード後の初期配置

`GLTFLoader` などで非同期にメッシュを追加する場合、ロード完了時点では `onpaint` は既に初回発火済みで、メッシュを追加しただけでは DOM が変化しないため `onpaint` は再発火しない。結果として、追加されたメッシュは初期座標（原点）のままになる。

ロード callback 内で明示的に `updateOverlayPositions()` を呼ぶ:

```js
new GLTFLoader().load( './model.glb', ( gltf ) => {

	// ... mesh セットアップ ...
	scene.add( mesh );
	updateOverlayPositions();

} );
```

---

### ポリフィル

ネイティブ未対応環境では `three-html-render/polyfill` を使う。Chrome 155 以降の API（`content="drawable"` など）に対応しているかは未確認。

```js
import { installHtmlInCanvasPolyfill } from 'three-html-render/polyfill';
if ( ! ( 'content' in HTMLCanvasElement.prototype ) ) {
	installHtmlInCanvasPolyfill();
}
```

CDN: `https://cdn.jsdelivr.net/npm/three-html-render/dist/polyfill.mjs`

### インタラクション

`InteractionManager`（`three/addons/interaction/InteractionManager.js`）を使うと、3D メッシュ上のポインターイベントを HTML 要素に転送できる。

```js
import { InteractionManager } from 'three/addons/interaction/InteractionManager.js';

const interactions = new InteractionManager();
interactions.connect( renderer, camera );
interactions.add( mesh );

// アニメーションループ内で:
interactions.update();
```

### ShaderMaterial に HTMLTexture を使う

ShaderMaterial には `material.map` がないため、`sampler2D` uniform に直接代入する:

```js
material.uniforms.uMap.value = new THREE.HTMLTexture( element );
```

---

## モジュール読み込みパターン

CDN を使う場合は importmap でバージョンをピン留めする。
バンドラー（Vite 等）を使う場合は npm install してそのままインポートする。

### CDN (importmap)

three.js のバージョンはコード実装時に npm registry で最新を確認してピン留めする。
`curl -s https://registry.npmjs.org/three/latest | python3 -c "import sys,json; print(json.load(sys.stdin)['version'])"`

```json
{
	"imports": {
		"three": "https://cdn.jsdelivr.net/npm/three@X.XXX.X/build/three.module.js",
		"three/addons/": "https://cdn.jsdelivr.net/npm/three@X.XXX.X/examples/jsm/",
		"three-html-render/polyfill": "https://cdn.jsdelivr.net/npm/three-html-render/dist/polyfill.mjs"
	}
}
```

### バンドラー (npm)

```sh
npm install three three-html-render
```

```js
import * as THREE from 'three';
import { installHtmlInCanvasPolyfill } from 'three-html-render/polyfill';
```
