# HTML in Canvas — 技術知識

## 情報ソース

- 仕様・提案: https://raw.githubusercontent.com/WICG/html-in-canvas/refs/heads/main/README.md
- Three.js 実装例: https://raw.githubusercontent.com/mrdoob/three.js/refs/heads/master/examples/webgl_materials_texture_html.html
- Origin Trial 案内: https://developer.chrome.com/blog/html-in-canvas-origin-trial

不明点はこれらのソースを再取得して確認すること。

---

## HTML in Canvas とは

WICG 提案。HTML 要素を `<canvas>` に直接描画できるようにする API。
長年 canvas で対応が難しかったテキストスタイリング、アクセシビリティ、国際化、パフォーマンスの課題を解決する。

### 有効化

**Origin Trial** 状態（Chrome 148〜150）。

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
| WebGL | `texElementImage2D()` |
| WebGPU | `copyElementImageToTexture()` |

---

## コア API（共通）

### `layoutsubtree` 属性
`<canvas layoutsubtree>` のように付与する。
子孫要素をレイアウト・ヒットテストに参加させる。直接の子要素は containing block になる。

canvas 自体は通常の DOM 要素として表示される。子要素は `drawElementImage()` / `texElementImage2D()` 等で canvas にレンダリングされることで画面に現れる。子要素そのものは直接は表示されない。

`drawElementImage()` / `captureElementImage()` / `texElementImage2D()` / `copyElementImageToTexture()` はいずれも `layoutsubtree` canvas の子要素を対象とする。`drawElementImage()` は仕様上「canvas の直接の子要素」であることが明示されている。

canvas の描画コンテキストに関わらず（2D / WebGL / WebGPU いずれも）、`layoutsubtree` 配下の DOM 要素はイベントが引き続き有効。`addEventListener` を付けるだけで canvas 越しに動作する。

### `onpaint` / `requestPaint()`
DOM の変化・CSS transition・CSS animation など、子要素の描画内容が変化するタイミングに合わせて自動で発火する。基本的には `onpaint` を監視するだけでよい。

`requestPaint()` は変化がない場合でも強制発火させるためのもの（`requestAnimationFrame` 相当）。

本来の DOM の描画更新とは別に、Three.js などシェーダーアニメーションがある場合は、`onpaint` とは独立してシェーダー側のアニメーションループで再レンダリングする。

イベントオブジェクト（`PaintEvent`）には `changedElements`（`FrozenArray<Element>`）が含まれ、変化した要素だけを再描画する最適化に使える。

```js
canvas.onpaint = ( event ) => {
	for ( const el of event.changedElements ) {
		// 変化した要素だけ再描画
	}
};
```

### `getElementTransform()`
`HTMLCanvasElement` と `OffscreenCanvas` のメソッド。WebGL / WebGPU など 3D コンテキストで使用する。
`drawElementImage()` が自動で transform を返すのに対し、3D コンテキストでは描画に使った変換行列を渡して DOM 同期用の CSS transform を算出する。

```js
// drawTransform: 要素を描画する際に使った変換行列（DOMMatrix）
const transform = canvas.getElementTransform( element, drawTransform );
element.style.transform = transform.toString();
```

### `captureElementImage()`
`HTMLCanvasElement` のメソッド。子要素のスナップショットを取得し、転送可能な `ElementImage` として返す。
Worker スレッドへ転送し、WebGL / WebGPU の各メソッドに `Element` の代わりに渡すことでオフスレッド描画ができる。

`ElementImage` は `width`・`height` プロパティを持ち、使い終わったら `close()` でリソースを解放する。

```js
const elementImage = canvas.captureElementImage( element );
console.log( elementImage.width, elementImage.height );

worker.postMessage( { elementImage }, [ elementImage ] );

// Worker 側で:
gl.texElementImage2D( gl.TEXTURE_2D, gl.RGBA8, elementImage );

// 使い終わったら解放
elementImage.close();
```

---

## Canvas 2D — `drawElementImage`

`CanvasRenderingContext2D` のメソッド。canvas の子要素を canvas に描画し、DOM 同期用の CSS transform（`DOMMatrix`）を返す。
canvas の現在の変換行列が適用される。source 要素の CSS transform は描画には無視される。

返り値の transform を element に適用することで、DOM のヒットテスト座標と canvas の描画座標を一致させる。省略するとクリック・ホバーなどのイベントが正しい位置で発火しない。

```js
canvas.onpaint = () => {
	ctx.reset();
	const transform = ctx.drawElementImage( element, 0, 0 );
	element.style.transform = transform.toString();
};
```

オーバーロードでソース領域のクロップや出力サイズも指定できる:

```js
// 出力先サイズを指定
ctx.drawElementImage( element, dx, dy, dwidth, dheight );

// ソース領域を指定して出力先へ
ctx.drawElementImage( element, sx, sy, swidth, sheight, dx, dy );
ctx.drawElementImage( element, sx, sy, swidth, sheight, dx, dy, dwidth, dheight );
```

---

## WebGL — `texElementImage2D`

`WebGLRenderingContext` に追加されるメソッド。HTML 要素の描画内容を WebGL テクスチャに直接バインドする。
`element` には DOM 要素または `captureElementImage()` で取得した `ElementImage` を渡せる（後者はワーカースレッドから呼び出せる）。

```js
gl.bindTexture( gl.TEXTURE_2D, texture );
gl.texElementImage2D( gl.TEXTURE_2D, gl.RGBA8, element );

// config でソース領域のクロップや出力サイズを指定することもできる
gl.texElementImage2D( gl.TEXTURE_2D, gl.RGBA8, element, {
	sx: 0, sy: 0, swidth: 480, sheight: 670,
	width: 512, height: 512,
} );

// テキストを含む場合はミップマップより LINEAR フィルタが良好
gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR );
```

> **注: シグネチャは Chrome 150 で変更された。** Chrome 138–149 は `texImage2D` 互換の旧 6 引数 `(target, level, internalformat, srcformat, srctype, element)`、Chrome 150+ / WICG 仕様は新 3 引数 `(target, internalformat, element[, config])`。本ドキュメントのサンプルは新仕様で記載。旧仕様をサポートする必要がある場合は「既知のバグ」節の判定方法を参照。

---

## WebGPU — `copyElementImageToTexture`

`GPUQueue` に追加されるメソッド。HTML 要素の描画内容を GPU テクスチャにコピーする。
`source` には DOM 要素または `ElementImage` を渡せる（後者はワーカースレッドから呼び出せる）。

```js
device.queue.copyElementImageToTexture(
	{ source: element },
	{ destination: gpuTexture, width: 512, height: 512 }
);

// ソース領域のクロップも指定できる
device.queue.copyElementImageToTexture(
	{ source: element, sx: 0, sy: 0, swidth: 480, sheight: 670 },
	{ destination: gpuTexture, width: 512, height: 512 }
);
```

---

## 最小完全例

### 2D Canvas

```html
<canvas id="canvas" layoutsubtree>
	<div id="content">
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
		const transform = ctx.drawElementImage( content, 0, 0 );
		content.style.transform = transform.toString();
	};
</script>
```

### WebGL

HTML in Canvas 固有の部分のみ示す。WebGL のシェーダー・バッファ設定などは通常の WebGL と同様。

```html
<canvas id="canvas" layoutsubtree>
	<div id="element">...</div>
</canvas>
<script>
	const canvas  = document.getElementById( 'canvas' );
	const element = document.getElementById( 'element' );
	const gl      = canvas.getContext( 'webgl2' );

	const texture = gl.createTexture();

	canvas.onpaint = () => {

		gl.bindTexture( gl.TEXTURE_2D, texture );
		gl.texElementImage2D( gl.TEXTURE_2D, gl.RGBA8, element );
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR );
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE );
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE );

		// ここで通常の WebGL 描画

	};
</script>
```

### WebGPU

HTML in Canvas 固有の部分のみ示す。デバイス・パイプライン設定などは通常の WebGPU と同様。

```html
<canvas id="canvas" layoutsubtree>
	<div id="element">...</div>
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

		device.queue.copyElementImageToTexture(
			{ source: element },
			{ destination: texture, width: 400, height: 300 }
		);

		// ここで通常の WebGPU 描画

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

### ブラウザ判定
```js
if ( ! ( 'requestPaint' in HTMLCanvasElement.prototype ) ) {
	// ネイティブ未対応
}
```

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

ただし **r184 には Chrome 150+ で動かないバグがある**（[PR #33788](https://github.com/mrdoob/three.js/pull/33788) で **r185 以降**に修正反映）。r184 を使う場合はモンキーパッチが必要。詳細は下記「既知のバグ」を参照。

- ソース: https://raw.githubusercontent.com/mrdoob/three.js/refs/heads/dev/src/textures/HTMLTexture.js
- ※ 同名の旧実装（`examples/jsm/renderers/HTMLMesh.js` の `HTMLTexture`）は別メカニズムで、現在は削除されている。

### 最小例

```html
<script type="importmap">
{ "imports": {
	"three": "https://cdn.jsdelivr.net/npm/three@X.XXX.X/build/three.module.js",
	"three/addons/": "https://cdn.jsdelivr.net/npm/three@X.XXX.X/examples/jsm/",
	"three-html-render/polyfill": "https://cdn.jsdelivr.net/npm/three-html-render/dist/polyfill.mjs"
} }
</script>
<script type="module">
import * as THREE from 'three';
import { installHtmlInCanvasPolyfill } from 'three-html-render/polyfill';

if ( ! ( 'requestPaint' in HTMLCanvasElement.prototype ) ) {
	installHtmlInCanvasPolyfill();
}

// Three.js は生の canvas を直接触らず、renderer を通してサイズとピクセル密度を指定する。
// canvas は renderer が生成し、appendChild で追加する。
const renderer = new THREE.WebGLRenderer( { antialias: true } );
renderer.setPixelRatio( window.devicePixelRatio );
renderer.setSize( window.innerWidth, window.innerHeight );
renderer.setAnimationLoop( animate );
document.body.appendChild( renderer.domElement );

const camera = new THREE.PerspectiveCamera( 50, window.innerWidth / window.innerHeight, 1, 2000 );
camera.position.z = 500;

const scene = new THREE.Scene();

const element = document.createElement( 'div' );
element.innerHTML = `<p>Hello <strong>Three.js!</strong></p>`;

const material = new THREE.MeshStandardMaterial();
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

要素の配置方法は 2 通り。どちらでも動く:

**A. `<canvas layoutsubtree>` の子として HTML に直接書く**

`HTMLTexture` のコンストラクタが `element.parentNode` を見て、`requestPaint` を持つ canvas であれば自動で `canvas.onpaint` を登録して `requestPaint()` を呼ぶ。ユーザーは `onpaint` セットアップ不要。

```html
<canvas id="canvas" layoutsubtree>
	<div id="element">...</div>
</canvas>
```

```js
const element = document.getElementById( 'element' );
material.map = new THREE.HTMLTexture( element );
```

**B. `document.createElement()` で生成（canvas の外）**

Three.js の `WebGLTextures` が初回アップロード時に要素を renderer の canvas に移し、`onpaint` を登録する。

```js
const element = document.createElement( 'div' );
element.innerHTML = `<p>Hello <strong>Canvas!</strong></p>`;
material.map = new THREE.HTMLTexture( element );
```

### 既知のバグ（r184 で発生、r185 で修正済み）

#### 状況

`texElementImage2D` の API シグネチャが Chrome 150 で変更された:

- Chrome 138 – 149: `texImage2D` 風の 6 引数 `(target, level, internalformat, srcformat, srctype, element)`
- Chrome 150+ / [WICG 仕様](https://raw.githubusercontent.com/WICG/html-in-canvas/refs/heads/main/README.md): 3 引数 `(target, internalformat, element[, config])`

```idl
void texElementImage2D(GLenum target, GLenum internalformat,
                       (Element or ElementImage) element,
                       optional WebGLCopyElementImageConfig config = {});
```

r184 の [WebGLTextures.js:1303](https://github.com/mrdoob/three.js/blob/r184/src/renderers/webgl/WebGLTextures.js#L1303) は旧 6 引数のみで呼んでいるため、Chrome 150+ で `The provided value is not of type '(Element or ElementImage)'` エラーになる。

#### 修正状況

- **r184**: 未修正
- **r185 以降**: [PR #33788](https://github.com/mrdoob/three.js/pull/33788)（2026-06-12 マージ）で修正。`_gl.texElementImage2D.length === 3` で実行時にシグネチャを判定して両対応。

修正後の該当箇所: [src/renderers/webgl/WebGLTextures.js](https://github.com/mrdoob/three.js/blob/dev/src/renderers/webgl/WebGLTextures.js)（`if ( _gl.texElementImage2D.length === 3 )` の分岐）

#### r184 での回避策

r185 にアップグレードできない場合は、WebGL コンテキスト取得直後にモンキーパッチで r185 と同等の挙動にする。

`gl.texElementImage2D.length === 3` でシグネチャを判定し、新仕様の Chrome 150+ のときだけ 6 → 3 引数に変換する。旧仕様の Chrome 148/149 では r184 の 6 引数呼び出しがそのまま通るのでパッチ不要（PR #33788 と同じ判定方式）:

```js
const gl = renderer.getContext();
if ( 'texElementImage2D' in gl && gl.texElementImage2D.length === 3 ) {

	const _orig = gl.texElementImage2D.bind( gl );
	gl.texElementImage2D = function () {

		const args = Array.from( arguments );
		if ( args.length >= 6 && args[ 5 ] instanceof Element ) {

			_orig( args[ 0 ], gl.RGBA8, args[ 5 ] );

		} else {

			_orig.apply( gl, args );

		}

	};

}
```

### 初回 `onpaint` 前に `render()` を呼ぶとエラー

#### 状況

`setAnimationLoop` はレンダラー生成直後から動き出す。`onpaint` が一度も発火していない状態で `texElementImage2D` が呼ばれると次のエラーになる:

```
InvalidStateError: Failed to execute 'texElementImage2D': No cached paint record for element.
```

#### 原因

`texElementImage2D` は `onpaint` によってキャッシュされた paint record を参照するため、`onpaint` 発火前には呼べない。

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

`texElementImage2D` はブラウザが sRGB でレンダリングした画素データをテクスチャに直接アップロードする。Three.js は r152 以降 `outputColorSpace` のデフォルトが `SRGBColorSpace` になっており、`MeshBasicMaterial` 使用時はシェーダー末尾に linear → sRGB の gamma encode が自動注入される。

`texture.colorSpace = THREE.SRGBColorSpace` を設定して sRGB → linear デコードを入れても、r184 の HTMLTexture では `texElementImage2D` アップロードパスでデコードが空振りするため、gamma encode だけが適用されて色が明るくなる。

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

- `texElementImage2D` は `onpaint` で更新された paint record キャッシュを参照する。テクスチャ内容は前回 `onpaint` 発火時点の DOM 状態。
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

ネイティブ未対応環境では `three-html-render/polyfill` を使う。

```js
import { installHtmlInCanvasPolyfill } from 'three-html-render/polyfill';
if ( ! ( 'requestPaint' in HTMLCanvasElement.prototype ) ) {
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
