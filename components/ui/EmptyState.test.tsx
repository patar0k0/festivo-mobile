import { render, screen, fireEvent } from '@testing-library/react-native';

import { EmptyState } from '@/components/ui/EmptyState';

describe('EmptyState', () => {
  it('renders title and subtitle', () => {
    render(<EmptyState icon="sparkles-outline" title="Няма нищо" subtitle="Пробвай по-късно" />);
    expect(screen.getByText('Няма нищо')).toBeTruthy();
    expect(screen.getByText('Пробвай по-късно')).toBeTruthy();
  });

  it('renders an action button and fires onPress', () => {
    const onPress = jest.fn();
    render(
      <EmptyState icon="sparkles-outline" title="Празно" action={{ label: 'Действие', onPress }} />,
    );
    fireEvent.press(screen.getByText('Действие'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('omits the action button when no action is provided', () => {
    render(<EmptyState icon="sparkles-outline" title="Празно" />);
    expect(screen.queryByText('Действие')).toBeNull();
  });
});
