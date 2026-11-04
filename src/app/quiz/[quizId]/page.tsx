import { WorkflowStatusPoller } from '../../../components/WorkflowStatusPoller';
export default async function QuizPage({params}:{params:Promise<{quizId:string}>}){const {quizId}=await params; return <WorkflowStatusPoller quizId={quizId}/>;}
