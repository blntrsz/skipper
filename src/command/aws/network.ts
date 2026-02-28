import {
  DescribeSubnetsCommand,
  DescribeVpcsCommand,
  EC2Client,
} from "@aws-sdk/client-ec2";

export type DefaultNetwork = {
  vpcId: string;
  subnetIds: string[];
};

export async function discoverDefaultNetwork(
  client: EC2Client,
): Promise<DefaultNetwork> {
  const vpcs = await client.send(
    new DescribeVpcsCommand({
      Filters: [{ Name: "isDefault", Values: ["true"] }],
    }),
  );

  const vpcId = vpcs.Vpcs?.[0]?.VpcId;
  if (!vpcId) throw new Error("default VPC not found");

  const subnetsRes = await client.send(
    new DescribeSubnetsCommand({
      Filters: [
        { Name: "vpc-id", Values: [vpcId] },
        { Name: "state", Values: ["available"] },
      ],
    }),
  );

  const subnetIds = (subnetsRes.Subnets ?? [])
    .map((subnet: { SubnetId?: string }) => subnet.SubnetId)
    .filter((id: string | undefined): id is string => Boolean(id));

  if (subnetIds.length === 0) {
    throw new Error(`no available subnets in default VPC ${vpcId}`);
  }

  return {
    vpcId,
    subnetIds,
  };
}
