import {useEffect, useState} from 'react';
import {useMutation, useQuery} from 'convex/react';
import {api} from '../convex/_generated/api';
import {Id} from "../convex/_generated/dataModel";

export default function User() {
    const [userId, setUserId] = useState<Id<'users'> | null>(null);
    const user = useQuery(api.users.getUser, userId ? {user: userId} : 'skip');
    const setUser = useMutation(api.users.setUser);

    useEffect(() => {
        async function fetchUser() {
            const id = await setUser();
            setUserId(id);
        }
        void fetchUser();
    }, [setUser]);

    if (user === undefined) {
        return (<p>Loading user...</p>);
    }

    if (user === null) {
        return (<p>User record not found.</p>);
    }
    
    return (
        <div>
            <h1>Welcome, {user.firstName}!</h1>
            <p>Email: {user.email}</p>
        </div>
    );
}