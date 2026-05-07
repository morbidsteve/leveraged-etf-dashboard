import { redirect } from 'next/navigation';

export default function NewTradeRedirect() {
  redirect('/?d=newTrade');
}
