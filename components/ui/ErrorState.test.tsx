import { render, screen, fireEvent } from '@testing-library/react-native';

import { ErrorState } from '@/components/ui/ErrorState';

describe('ErrorState', () => {
  it('renders the message', () => {
    render(<ErrorState message="Нещо се обърка" onRetry={jest.fn()} />);
    expect(screen.getByText('Нещо се обърка')).toBeTruthy();
  });

  it('fires onRetry when the retry button is pressed', () => {
    const onRetry = jest.fn();
    render(<ErrorState message="Грешка" onRetry={onRetry} />);
    fireEvent.press(screen.getByText('Опитай пак'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('hides the retry button when no onRetry is provided', () => {
    render(<ErrorState message="Грешка" />);
    expect(screen.queryByText('Опитай пак')).toBeNull();
  });
});
