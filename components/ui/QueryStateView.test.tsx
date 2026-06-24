import { render, screen, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';

import { QueryStateView, type QueryLike } from '@/components/ui/QueryStateView';

function setup(query: QueryLike<number[]>) {
  return render(
    <QueryStateView<number[]>
      query={query}
      isEmpty={(d) => d.length === 0}
      loading={<Text>LOADING</Text>}
      empty={<Text>EMPTY</Text>}
    >
      {(data) => <Text>ITEMS:{data.length}</Text>}
    </QueryStateView>,
  );
}

describe('QueryStateView', () => {
  it('shows loading when loading and no data', () => {
    setup({ data: undefined, isLoading: true, isError: false, refetch: jest.fn() });
    expect(screen.getByText('LOADING')).toBeTruthy();
  });

  it('shows error (with retry) when error and no data', () => {
    const refetch = jest.fn();
    setup({ data: undefined, isLoading: false, isError: true, refetch });
    fireEvent.press(screen.getByText('Опитай пак'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('shows empty when success but data is empty', () => {
    setup({ data: [], isLoading: false, isError: false, refetch: jest.fn() });
    expect(screen.getByText('EMPTY')).toBeTruthy();
  });

  it('renders children with data when present', () => {
    setup({ data: [1, 2, 3], isLoading: false, isError: false, refetch: jest.fn() });
    expect(screen.getByText('ITEMS:3')).toBeTruthy();
  });

  it('prefers cached data over loading/error (no flicker on refetch)', () => {
    setup({ data: [1], isLoading: true, isError: true, refetch: jest.fn() });
    expect(screen.getByText('ITEMS:1')).toBeTruthy();
  });
});
