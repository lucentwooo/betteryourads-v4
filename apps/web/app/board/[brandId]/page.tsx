import Board from "../../../src/board/Board";

export default function Page({ params }: { params: { brandId: string } }) {
  return <Board brandId={params.brandId} />;
}
