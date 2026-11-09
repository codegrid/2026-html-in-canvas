// HTML in Canvas の新しい API（Chrome 155+）向けの共通処理。
//
// Three.js（r187 時点）の HTMLTexture は、Chrome 154 までの texElementImage2D() を前提にしている。
// 新しい API では texElementImage2D() がなくなり、
// texImage2D() で領域を確保してから texElementSubImage2D() で書き込む形になった。
// そこで、旧 API と同じ呼び出し方の texElementImage2D() を、新しい API で組み立てて補う。
// Three.js 側が新しい API に対応したら不要になる。

const glPrototypes = [ WebGLRenderingContext.prototype, WebGL2RenderingContext.prototype ];

for ( const proto of glPrototypes ) {

	if ( 'texElementImage2D' in proto || ! ( 'texElementSubImage2D' in proto ) ) continue;

	Object.defineProperty( proto, 'texElementImage2D', {
		configurable: true,
		writable: true,
		value: function texElementImage2D( target, internalformat, element ) {

			// 既定サイズは小数になることがある。切り捨てると書き込みがはみ出すので切り上げる
			const size = this.canvas.getElementImageDefaultSize( element );
			const width = Math.ceil( size.width );
			const height = Math.ceil( size.height );
			this.texImage2D( target, 0, internalformat, width, height, 0, this.RGBA, this.UNSIGNED_BYTE, null );
			this.texElementSubImage2D( target, 0, 0, 0, element );

		},
	} );

}

// content="drawable" の canvas の中の要素は、updateElementGeometry() で位置を登録するまで
// クリックやホバーの対象（ヒットテスト）にならない（2D の drawElementImage() は自動で登録する）。
// WebGL で要素をレイアウトどおりの位置に描いている場合に、その位置をそのまま登録する。
// canvasTransform は「要素のボーダーボックス（CSS px）→ canvas の CSS px 座標」の変換。
export function syncElementGeometry( canvas, element ) {

	const { x, y } = getOffsetInCanvas( canvas, element );

	canvas.updateElementGeometry( element, {
		canvasTransform: new DOMMatrix().translate( x, y ),
	} );

}

// canvas の中での要素のレイアウト上の位置（CSS px）。
// drawable の要素の getBoundingClientRect() は、レイアウト上の位置ではなく、
// updateElementGeometry() で登録した位置（未登録なら canvas の左上）を返すので使えない。
// 代わりに offsetLeft / offsetTop を offsetParent までたどって足し合わせる。
export function getOffsetInCanvas( canvas, element ) {

	const elementOffset = getPageOffset( element );
	const canvasOffset = getPageOffset( canvas );

	return {
		x: elementOffset.x - canvasOffset.x,
		y: elementOffset.y - canvasOffset.y,
	};

}

function getPageOffset( element ) {

	let x = 0;
	let y = 0;

	for ( let el = element; el !== null; el = el.offsetParent ) {

		x += el.offsetLeft;
		y += el.offsetTop;

	}

	return { x, y };

}
