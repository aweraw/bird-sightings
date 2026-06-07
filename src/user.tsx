import {useConvexAuth, useQuery} from 'convex/react';
import {api} from '../convex/_generated/api';

export default function User() {
    const {isAuthenticated, isLoading} = useConvexAuth();
    // The row is ensured app-wide by useEnsureUser() in App; here we just read it.
    const user = useQuery(api.users.me, isAuthenticated ? {} : 'skip');

    if (isLoading) {
        return (<p>Loading...</p>);
    }

    if (!isAuthenticated) {
        return (<h1>Welcome, visitor!</h1>);
    }

    if (user === undefined || user === null) {
        return (<p>Loading user...</p>);
    }

    return (
        <div>
            <h1>Welcome, {user.firstName}!</h1>
        </div>
    );
}
